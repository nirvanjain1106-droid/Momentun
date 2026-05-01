# Sprint 6 — Implementation Plan (Revision 11 — Final)

> [!IMPORTANT]
> Supersedes Rev 10. Changes marked `[V11-FIX]`. All Rev 10 `[V10-FIX]` items retained unless overridden.

---

## Architectural Invariants (Rev 10 + V11 additions)

| Invariant | Source |
|-----------|--------|
| Transaction: `get_db()` auto-commits/rollbacks | [database.py#L34-L47] |
| PostgreSQL READ COMMITTED. WHERE re-evaluates after row lock | PG default |
| Row lock on unique conflict: B blocks until A commits | PG MVCC |
| Session-per-day: `AsyncSessionLocal()` per day, `Semaphore(3)` | [schedule_service.py#L586-L604] |
| Pool: `size=10, max_overflow=20`. Advisory lock shares pool | [database.py#L15-L17] |
| `encrypt_field()` returns Fernet base64 **str**, not bytes | [encryption.py#L28-L34] |
| ON CONFLICT ON CONSTRAINT needs CONSTRAINT; use `index_elements` for partial UNIQUE INDEX | PG docs |
| NULL ≠ NULL in unique indexes | PG MVCC |
| `[V11-FIX]` **UUIDs are v4 (random).** `ORDER BY id` is NOT monotonic. Cursor pagination MUST use `created_at` or require `ENCRYPTION_ACTIVE=true` invariant (new rows skip `evening_note`). | [goal.py#L24: `default=uuid.uuid4`] |
| `[V11-FIX]` **`CREATE INDEX CONCURRENTLY` cannot run inside a transaction.** Alembic wraps in `begin_transaction()`. Must use `autocommit` execution or separate migration file. | [alembic/env.py#L67] |
| `[V11-FIX]` **`datetime.combine(date, time, tzinfo=ZoneInfo)` does NOT raise for DST gaps.** It silently returns fold=0. Must use `tz.normalize()` or compare `.utcoffset()` to detect. | Python 3.9+ ZoneInfo |

---

## Design Decisions (Rev 10 retained + V11 updates)

| # | Decision |
|---|----------|
| D1–D10 | Unchanged from Rev 10 |
| D11 | **Upsert for mutable notifications** — `index_elements` + `index_where`. Unchanged. |
| D12 | **DB-level dedup** — `IS NOT NULL` in partial index predicates. Unchanged. |
| D13 | **OCC for data migrations** — `WHERE column == original AND encrypted == False`. Unchanged. |
| D14 | `[V11-FIX]` **Versioned encryption is the ONLY interface.** `encrypt_field_versioned()` replaces `encrypt_field()` everywhere. Bare `encrypt_field()` is aliased to `encrypt_field_versioned()`. All ciphertext follows `v{N}:{token}` format from day 1. `ENCRYPTION_KEYS` is append-only (indices must never shift). |
| D15 | **Upsert MUST preserve ACK state.** Unchanged. |
| D16 | `[V11-NEW]` **Reverse migration requires OCC guard + versioned decrypt.** UPDATE WHERE includes `evening_note_ciphertext == original_ciphertext`. Uses `decrypt_field_versioned()`. Script asserts `ENCRYPTION_ACTIVE == False` at startup. |
| D17 | `[V11-NEW]` **Version-aware encryption flag.** Write path checks `ENCRYPTION_ACTIVE AND CODE_VERSION >= ENCRYPTION_MIN_VERSION`. Old pods that lack encryption columns ignore the flag. |
| D18 | `[V11-NEW]` **DST handling via UTC offset comparison**, not exception-based fallback. |
| D19 | `[V11-NEW]` **Background crons pause during encryption rollout** (Steps 8-12). Or: crons check `CRON_MAINTENANCE_MODE` flag and skip with log. |

---

## Feature 1 — Notification Engine

### 1.1 Schema (Migration 006) — unchanged from Rev 10

> [!IMPORTANT]
> `[V11-FIX]` **Alembic Implementation Note:** Indexes on the NEW `notifications` table (created in the same migration) can be inline DDL — no `CONCURRENTLY` needed since the table is empty. Indexes on EXISTING tables (§4.2, §6) MUST use a **separate migration file** with autocommit. See §Migration Alembic Pattern below.

### 1.2 Body Encryption — unchanged from Rev 10

### 1.3 Notification Generation `[V11-FIX]`

```python
async def generate_daily_notifications(user_id, schedule, target_date, db):
    user = await _get_user_with_tz(user_id, db)

    # ── Timezone validation ──
    try:
        user_tz = ZoneInfo(user.timezone)
    except (KeyError, TypeError):
        logger.error("invalid_timezone", extra={
            "user_id": str(user_id), "timezone": user.timezone,
        })
        NOTIFICATION_TIMEZONE_ERROR.inc()  # V11: instrumented
        return

    # ── Morning check-in (immutable — DO NOTHING) ──
    morning_utc = _safe_localize(target_date, time(7, 0), user_tz)  # V11: helper
    stmt = pg_insert(Notification).values(
        user_id=user_id, type='checkin_morning',
        title='Good morning! Ready to crush today?',
        body_encrypted=encrypt_field_versioned('Your schedule is ready.'),  # V11: versioned
        fire_at=morning_utc,
        schedule_date=target_date,
    ).on_conflict_do_nothing()
    await db.execute(stmt)

    # ── Task reminders (mutable — upsert) (D11, D15) ──
    for task in schedule.tasks:
        if task.scheduled_start is None:
            continue

        try:
            parsed_time = _parse_time(task.scheduled_start)
        except (ValueError, TypeError):
            logger.warning("bad_scheduled_start", extra={
                "task_id": str(task.id), "value": task.scheduled_start,
            })
            continue

        fire_at_utc = _safe_localize(target_date, parsed_time, user_tz)  # V11
        if fire_at_utc is None:
            logger.warning("time_localization_failed", extra={
                "task_id": str(task.id), "date": str(target_date),
                "time": str(parsed_time),
            })
            continue

        fire_at_utc -= timedelta(minutes=10)
        title = f'{(task.title or "Task")[:50]} in 10 minutes'
        body = encrypt_field_versioned(  # V11: versioned
            f'Scheduled at {task.scheduled_start}'
        )

        stmt = pg_insert(Notification).values(
            user_id=user_id, type='task_reminder',
            title=title, body_encrypted=body,
            fire_at=fire_at_utc, schedule_date=target_date,
            reminder_task_id=task.id,
        ).on_conflict_do_update(
            index_elements=['user_id', 'reminder_task_id', 'schedule_date'],
            index_where=(
                (Notification.type == 'task_reminder')
                & (Notification.reminder_task_id.isnot(None))
                & (Notification.schedule_date.isnot(None))
            ),
            set_={'fire_at': fire_at_utc, 'body_encrypted': body, 'title': title},
            where=(
                Notification.dismissed_at.is_(None)
                & Notification.delivered_at.is_(None)
            ),
        )
        result = await db.execute(stmt)

        # V11: Instrument upsert conflicts
        if result.rowcount == 0:
            NOTIFICATION_UPSERT_CONFLICT.labels(type='task_reminder', result='skipped').inc()
        elif result.rowcount == 1:
            NOTIFICATION_UPSERT_CONFLICT.labels(type='task_reminder', result='updated').inc()

    logger.info("notifications_generated", extra={
        "user_id": str(user_id), "schedule_date": target_date.isoformat(),
    })
```

#### V11: `_safe_localize` helper (replaces broken DST fallback)

```python
def _safe_localize(
    target_date: date, local_time: time, tz: ZoneInfo
) -> Optional[datetime]:
    """
    Convert local date+time to UTC, handling DST gaps and edge cases.

    V11-FIX: Replaces exception-based fallback that crashed at 23:00.
    datetime.combine with ZoneInfo never raises for gaps (sets fold=0).
    We detect gaps via UTC offset comparison and log them.

    Returns UTC datetime, or None if localization fails entirely.
    """
    try:
        dt = datetime.combine(target_date, local_time, tzinfo=tz)
        utc_dt = dt.astimezone(timezone.utc)

        # Detect DST gap: round-trip back to local and compare
        roundtrip = utc_dt.astimezone(tz)
        if roundtrip.hour != local_time.hour:
            logger.info("dst_gap_detected", extra={
                "requested": str(local_time),
                "actual_local": str(roundtrip.time()),
                "date": str(target_date),
                "tz": str(tz),
            })
            # The UTC time is still correct — PG stores UTC.
            # The local time just doesn't exist. Log and proceed.

        return utc_dt

    except Exception as e:
        logger.error("localization_failed", extra={
            "date": str(target_date), "time": str(local_time),
            "tz": str(tz), "error": str(e),
        })
        return None
```

> [!IMPORTANT]
> **V11 changes from V10 in §1.3:**
> 1. Removed `time(parsed_time.hour + 1, 0)` fallback — crashes at 23:00 with `ValueError: hour must be in 0..23`
> 2. Replaced with `_safe_localize` that handles DST via round-trip comparison, never raises
> 3. All `encrypt_field()` → `encrypt_field_versioned()` (D14 wired)
> 4. Added `NOTIFICATION_UPSERT_CONFLICT` counter instrumentation
> 5. Added `NOTIFICATION_TIMEZONE_ERROR` counter instrumentation

### 1.4 API — GET + POST /ack `[V11-FIX: MUST VERIFY]`

```python
# V11: The API serializer MUST decrypt body_encrypted before returning to client.
# This was "unchanged" in Rev 10 — MUST be implemented.

class NotificationResponse(BaseModel):
    id: UUID
    type: str
    title: str
    body: str  # Decrypted plaintext — NOT body_encrypted
    fire_at: Optional[datetime]
    delivered_at: Optional[datetime]
    dismissed_at: Optional[datetime]
    created_at: datetime

    @classmethod
    def from_db(cls, notification: Notification) -> "NotificationResponse":
        return cls(
            id=notification.id,
            type=notification.type,
            title=notification.title,
            body=decrypt_field_versioned(notification.body_encrypted),  # V11
            fire_at=notification.fire_at,
            delivered_at=notification.delivered_at,
            dismissed_at=notification.dismissed_at,
            created_at=notification.created_at,
        )
```

### 1.5 Retention `[V11-NEW]`

```python
# V11-NEW: Notification retention job (nightly cron)
# Prevents unbounded table growth

async def cleanup_old_notifications():
    """Delete notifications older than 90 days."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            sa_delete(Notification).where(
                Notification.created_at < cutoff,
                Notification.dismissed_at.isnot(None),  # Only dismissed
            )
        )
        await db.commit()
        logger.info("notification_retention_cleanup", extra={
            "deleted_count": result.rowcount,
            "cutoff": cutoff.isoformat(),
        })
```

---

## Feature 2 — Recurring Tasks — unchanged
## Feature 3 — Milestones — unchanged

---

## Feature 4 — Rescue Mission

### 4.1–4.3 — unchanged from Rev 10

### 4.2 Migration 007b — Rescue Candidate Index `[V11-FIX]`

```python
# V11-FIX: Separate Alembic migration file with autocommit
# File: alembic/versions/007b_concurrent_indexes.py

from alembic import op
import sqlalchemy as sa

# V11: This migration MUST run outside a transaction
# because CREATE INDEX CONCURRENTLY cannot be in a transaction block

revision = '007b'
down_revision = '007'

def upgrade():
    # V11-FIX: Use Alembic's native concurrently flag + autocommit
    with op.get_context().autocommit_block():
        op.create_index(
            'ix_tasks_rescue_candidate',
            'tasks',
            ['task_status', 'created_at'],
            postgresql_where=sa.text("goal_id IS NOT NULL AND deleted_at IS NULL"),
            postgresql_concurrently=True,
        )

def downgrade():
    op.drop_index('ix_tasks_rescue_candidate', table_name='tasks')
```

> [!IMPORTANT]
> **V11: Alembic CONCURRENTLY Pattern** — All `CREATE INDEX CONCURRENTLY` migrations on existing tables MUST:
> 1. Be in a **separate migration file** (not combined with DDL that needs transactions)
> 2. Use `op.get_context().autocommit_block()` or `execution_options={'isolation_level': 'AUTOCOMMIT'}`
> 3. Use `postgresql_concurrently=True` flag
> 4. This applies to: Migration 007b (rescue index), Migration 009 (heatmap index)

---

## Feature 5 — Encryption Pipeline

### 5.1 Migration 011 — unchanged from Rev 10

### 5.2 Encryption Module — Unified Versioned Interface `[V11-FIX]`

```python
# app/core/encryption.py — V11 rewrite

"""
V11: All encryption uses versioned format: "v{N}:{fernet_token}"
encrypt_field() is now an alias for encrypt_field_versioned().
Bare Fernet calls are internal only.
"""

import base64, hashlib
from typing import Optional, List
from cryptography.fernet import Fernet
from app.config import settings

def _get_key_for_version(version: int) -> bytes:
    """Derive Fernet key for a specific version."""
    keys: List[str] = settings.ENCRYPTION_KEYS
    if version < 0 or version >= len(keys):
        raise ValueError(f"Invalid key version {version}, have {len(keys)} keys")
    raw = keys[version].encode("utf-8")
    digest = hashlib.sha256(raw).digest()
    return base64.urlsafe_b64encode(digest)

def encrypt_field_versioned(value: Optional[str]) -> Optional[str]:
    """Encrypt with active key version. Returns 'v{N}:{token}' or None."""
    if value is None or value == "":
        return value
    version = settings.ACTIVE_KEY_VERSION
    key = _get_key_for_version(version)
    token = Fernet(key).encrypt(value.encode("utf-8")).decode("utf-8")
    return f"v{version}:{token}"

def decrypt_field_versioned(value: Optional[str]) -> Optional[str]:
    """Decrypt versioned ciphertext. Handles legacy (no prefix) via key 0."""
    if value is None or value == "":
        return value
    if value.startswith("v") and ":" in value[:5]:
        version_str, token = value.split(":", 1)
        version = int(version_str[1:])
    else:
        # Legacy: no version prefix → assume key 0
        version = 0
        token = value
    key = _get_key_for_version(version)
    return Fernet(key).decrypt(token.encode("utf-8")).decode("utf-8")

# V11: Alias — prevent accidental unversioned use
encrypt_field = encrypt_field_versioned
decrypt_field = decrypt_field_versioned
```

### 5.2b Config additions `[V11-FIX]`

```python
# In Settings class:
ENCRYPTION_ACTIVE: bool = False
ENCRYPTION_MIN_VERSION: int = 11  # V11: minimum CODE_VERSION for encryption
CODE_VERSION: int = 11
ENCRYPTION_KEYS: list = [""]  # V11: append-only list. Index = version.
ACTIVE_KEY_VERSION: int = 0

# V11: Startup validation
@model_validator(mode="after")
def validate_encryption_keys(self) -> "Settings":
    if self.ACTIVE_KEY_VERSION >= len(self.ENCRYPTION_KEYS):
        raise ValueError(
            f"ACTIVE_KEY_VERSION={self.ACTIVE_KEY_VERSION} but only "
            f"{len(self.ENCRYPTION_KEYS)} keys configured"
        )
    if self.ENCRYPTION_KEYS and not self.ENCRYPTION_KEYS[0]:
        if self.APP_ENV == "production":
            raise ValueError("ENCRYPTION_KEYS[0] must be set in production")
    return self
```

### 5.2c Write Path `[V11-FIX]`

```python
async def save_evening_note(daily_log: DailyLog, plaintext: str, db: AsyncSession):
    """V11: Uses versioned encryption. Checks version-aware flag (D17)."""
    if (settings.ENCRYPTION_ACTIVE
            and settings.CODE_VERSION >= settings.ENCRYPTION_MIN_VERSION):
        ciphertext = encrypt_field_versioned(plaintext)  # V11: versioned
        if ciphertext is None:
            raise ValueError("Encryption failed — D9 hard failure")
        daily_log.evening_note_ciphertext = ciphertext.encode('utf-8')
        daily_log.evening_note_encrypted = True
        daily_log.evening_note = None
    else:
        daily_log.evening_note = plaintext
        daily_log.evening_note_encrypted = False
    await db.flush()
```

### 5.3 Read Path — unchanged from Rev 10 (uses `decrypt_field` which is now aliased to `decrypt_field_versioned`)

### 5.4 Forward Migration Script `[V11-FIX]`

```python
async def migrate_evening_notes():
    """
    V11 fixes over V10:
    1. Uses encrypt_field_versioned (D14 uniform format)
    2. Asserts ENCRYPTION_ACTIVE=true at startup (UUIDv4 cursor safety)
    3. Uses created_at cursor instead of id (UUIDv4 is non-monotonic)
    4. Logs failed row IDs to dead-letter list for manual retry
    """
    # V11: Pre-condition assertion
    assert settings.ENCRYPTION_ACTIVE, (
        "ENCRYPTION_ACTIVE must be True before migration. "
        "New writes must bypass evening_note to prevent cursor skips."
    )

    batch_size = 500
    total_migrated = 0
    total_skipped = 0
    total_errors = 0
    consecutive_errors = 0
    MAX_CONSECUTIVE_ERRORS = 10
    dead_letter_ids: list[str] = []  # V11: track failed rows

    # V11: Use created_at cursor (monotonic) instead of id (UUIDv4 random)
    last_seen_created_at = datetime.min.replace(tzinfo=timezone.utc)

    async with AsyncSessionLocal() as count_db:
        total_remaining = await count_db.scalar(
            select(func.count()).where(
                DailyLog.evening_note.isnot(None),
                DailyLog.evening_note_encrypted == False,
            )
        )
    logger.info("encryption_migration_start", extra={"total_rows": total_remaining})
    ENCRYPTION_MIGRATION_REMAINING.set(total_remaining)  # V11: instrumented

    while True:
        async with AsyncSessionLocal() as db:
            rows = await db.execute(
                select(DailyLog).where(
                    DailyLog.evening_note.isnot(None),
                    DailyLog.evening_note_encrypted == False,
                    DailyLog.created_at > last_seen_created_at,  # V11: monotonic cursor
                ).order_by(DailyLog.created_at).limit(batch_size)
            )
            batch = rows.scalars().all()
            if not batch:
                break

            for row in batch:
                last_seen_created_at = row.created_at  # advance cursor

                try:
                    original_text = row.evening_note
                    ciphertext = encrypt_field_versioned(original_text)  # V11: versioned
                    if ciphertext is None:
                        raise ValueError("encrypt_field_versioned returned None")

                    stmt = sa_update(DailyLog).where(
                        DailyLog.id == row.id,
                        DailyLog.evening_note == original_text,
                        DailyLog.evening_note_encrypted == False,
                    ).values(
                        evening_note_ciphertext=ciphertext.encode('utf-8'),
                        evening_note_encrypted=True,
                        evening_note=None,
                    )
                    result = await db.execute(stmt)

                    if result.rowcount == 1:
                        total_migrated += 1
                        consecutive_errors = 0
                    else:
                        total_skipped += 1

                except Exception as e:
                    total_errors += 1
                    consecutive_errors += 1
                    dead_letter_ids.append(str(row.id))  # V11: track
                    logger.error("encryption_migration_row_error", extra={
                        "daily_log_id": str(row.id), "error": str(e),
                    })
                    ENCRYPTION_MIGRATION_ERRORS.inc()  # V11: instrumented
                    if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                        logger.critical("encryption_migration_circuit_breaker", extra={
                            "total_migrated": total_migrated,
                            "dead_letter_ids": dead_letter_ids,
                        })
                        raise RuntimeError(
                            f"Circuit breaker: {MAX_CONSECUTIVE_ERRORS} consecutive failures"
                        )

            await db.commit()
            ENCRYPTION_MIGRATION_REMAINING.set(total_remaining - total_migrated)

    # V11: Log dead-letter list for manual retry
    if dead_letter_ids:
        logger.warning("encryption_migration_dead_letter", extra={
            "count": len(dead_letter_ids),
            "ids": dead_letter_ids[:100],  # Cap log size
        })

    logger.info("encryption_migration_complete", extra={
        "total_migrated": total_migrated,
        "total_skipped": total_skipped,
        "total_errors": total_errors,
        "dead_letter_count": len(dead_letter_ids),
    })
```

### 5.7 Reverse Migration `[V11-REWRITE]`

```python
async def reverse_migrate_evening_notes():
    """
    V11 REWRITE — Emergency rollback: decrypt ciphertext → plaintext.

    Fixes from V10:
    1. Uses decrypt_field_versioned (handles v{N}: prefix)
    2. OCC guard: WHERE ciphertext == original_ciphertext (D16)
    3. Asserts ENCRYPTION_ACTIVE == False
    4. Per-row error handling + dead-letter logging
    5. created_at cursor (UUIDv4 non-monotonic)
    """
    assert not settings.ENCRYPTION_ACTIVE, (
        "ENCRYPTION_ACTIVE must be False before reverse migration. "
        "New writes must go to plaintext to prevent data loss."
    )

    batch_size = 500
    total_reversed = 0
    total_errors = 0
    dead_letter_ids: list[str] = []
    last_seen_created_at = datetime.min.replace(tzinfo=timezone.utc)

    while True:
        async with AsyncSessionLocal() as db:
            rows = await db.execute(
                select(DailyLog).where(
                    DailyLog.evening_note_encrypted == True,
                    DailyLog.evening_note_ciphertext.isnot(None),
                    DailyLog.created_at > last_seen_created_at,
                ).order_by(DailyLog.created_at).limit(batch_size)
            )
            batch = rows.scalars().all()
            if not batch:
                break

            for row in batch:
                last_seen_created_at = row.created_at

                try:
                    original_ciphertext = row.evening_note_ciphertext
                    plaintext = decrypt_field_versioned(  # V11: versioned
                        original_ciphertext.decode('utf-8')
                    )

                    # V11: OCC guard (D16)
                    stmt = sa_update(DailyLog).where(
                        DailyLog.id == row.id,
                        DailyLog.evening_note_encrypted == True,
                        DailyLog.evening_note_ciphertext == original_ciphertext,
                    ).values(
                        evening_note=plaintext,
                        evening_note_encrypted=False,
                        evening_note_ciphertext=None,
                    )
                    result = await db.execute(stmt)

                    if result.rowcount == 1:
                        total_reversed += 1
                    else:
                        logger.warning("reverse_migration_occ_skip", extra={
                            "daily_log_id": str(row.id),
                        })

                except Exception as e:
                    total_errors += 1
                    dead_letter_ids.append(str(row.id))
                    logger.error("reverse_migration_error", extra={
                        "daily_log_id": str(row.id), "error": str(e),
                    })

            await db.commit()

    logger.info("reverse_migration_complete", extra={
        "total_reversed": total_reversed,
        "total_errors": total_errors,
        "dead_letter_count": len(dead_letter_ids),
    })
```

### 5.8 Re-Encryption Job `[V11-NEW]`

```python
# scripts/reencrypt_data.py
# V11-NEW: Background re-encryption for key rotation (D14 runbook step 4)

async def reencrypt_evening_notes(target_version: int):
    """
    Re-encrypt all ciphertext to target key version.
    Reuses §5.4 cursor/OCC pattern.
    """
    assert target_version < len(settings.ENCRYPTION_KEYS)
    batch_size = 500
    last_seen_created_at = datetime.min.replace(tzinfo=timezone.utc)
    total = 0

    while True:
        async with AsyncSessionLocal() as db:
            rows = await db.execute(
                select(DailyLog).where(
                    DailyLog.evening_note_encrypted == True,
                    DailyLog.evening_note_ciphertext.isnot(None),
                    DailyLog.created_at > last_seen_created_at,
                ).order_by(DailyLog.created_at).limit(batch_size)
            )
            batch = rows.scalars().all()
            if not batch:
                break

            for row in batch:
                last_seen_created_at = row.created_at
                ct = row.evening_note_ciphertext.decode('utf-8')

                # Skip if already on target version
                if ct.startswith(f"v{target_version}:"):
                    continue

                try:
                    plaintext = decrypt_field_versioned(ct)
                    new_ct = encrypt_field_versioned(plaintext)  # Uses ACTIVE version

                    original_ct = row.evening_note_ciphertext
                    stmt = sa_update(DailyLog).where(
                        DailyLog.id == row.id,
                        DailyLog.evening_note_ciphertext == original_ct,  # OCC
                    ).values(
                        evening_note_ciphertext=new_ct.encode('utf-8'),
                    )
                    result = await db.execute(stmt)
                    if result.rowcount == 1:
                        total += 1

                except Exception as e:
                    logger.error("reencrypt_error", extra={
                        "daily_log_id": str(row.id), "error": str(e),
                    })

            await db.commit()

    logger.info("reencryption_complete", extra={"total_reencrypted": total})
```

---

## Feature 6 — Heatmap Cache — unchanged (index migration uses same CONCURRENTLY pattern as §4.2)
## Health Profile — unchanged
