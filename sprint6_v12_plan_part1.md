# Sprint 6 — Implementation Plan (Revision 12 — Production-Final)

> [!IMPORTANT]
> Supersedes Rev 11. Changes marked `[V12-FIX]`. Follows Karpathy guidelines: minimum code, no speculation, every change traceable to a verifiable test.

---

## Architectural Invariants

| # | Invariant | Evidence |
|---|-----------|---------|
| I1 | `get_db()` auto-commits/rollbacks | database.py#L34-L47 |
| I2 | PostgreSQL READ COMMITTED. WHERE re-evaluates after row lock | PG default |
| I3 | Session-per-day with `Semaphore(3)`. Pool: `size=10, max_overflow=20` | schedule_service.py, database.py |
| I4 | `encrypt_field()` returns Fernet base64 **str** | encryption.py#L28-L34 |
| I5 | ON CONFLICT for partial UNIQUE INDEX requires `index_elements` + `index_where` | PG docs |
| I6 | NULL ≠ NULL in unique indexes | PG MVCC |
| I7 | UUIDs are v4 (random, non-monotonic). `ORDER BY id` is NOT sequential | goal.py#L24 |
| I8 | `CREATE INDEX CONCURRENTLY` cannot run inside a transaction | PG docs |
| I9 | `datetime.combine(date, time, tzinfo=ZoneInfo)` never raises for DST gaps — sets fold=0 silently | Python ZoneInfo |
| I10 | Alembic wraps migrations in `begin_transaction()` by default | alembic/env.py#L67 |
| I11 | `[V12]` **PostgreSQL ≥ 11 required.** `ADD COLUMN ... DEFAULT x NOT NULL` is metadata-only in PG 11+. Pre-flight check at migration startup. |
| I12 | `[V12]` **`"v10:".startswith("v1:")` is True in Python.** Version prefix matching MUST parse numerically, never via `startswith`. |
| I13 | `[V12]` **`TIMESTAMPTZ` has microsecond precision.** Bulk inserts produce identical timestamps. `>` predicate skips ties. Cursors MUST be composite `(created_at, id)`. |

---

## Design Decisions

| # | Decision |
|---|----------|
| D1–D13 | Unchanged from Rev 10 |
| D14 | **Versioned encryption is the only interface.** `encrypt_field = encrypt_field_versioned` (same-module alias). Format: `v{N}:{token}`. `ENCRYPTION_KEYS` is append-only. |
| D15 | **Upsert preserves ACK state.** `dismissed_at`/`delivered_at` never in `set_`. |
| D16 | **Reverse migration: OCC + versioned decrypt + assert flag=false.** |
| D17 | **Version-aware encryption flag.** Write path checks `ENCRYPTION_ACTIVE AND CODE_VERSION >= ENCRYPTION_MIN_VERSION`. |
| D18 | **DST: full naive datetime comparison**, not hour-only. |
| D19 | **Cron gating: explicit `kubectl rollout restart` after flag change**, not hot-reload. |
| D20 | `[V12-NEW]` **Composite cursor `(created_at, id)` for all batch scripts.** Handles timestamp ties and UUIDv4 non-monotonicity. |
| D21 | `[V12-NEW]` **Re-encryption uses `ACTIVE_KEY_VERSION` only.** No `target_version` parameter. Version comparison is numeric, never string prefix. |
| D22 | `[V12-NEW]` **API list reads degrade gracefully.** Per-row decrypt failure → `"[encrypted]"` placeholder + structured log. D9 hard-failure applies to writes only. |
| D23 | `[V12-NEW]` **Dead-letter persistence.** Failed migration row IDs written to `encryption_dead_letters` DB table, not in-memory list. |
| D24 | `[V12-NEW]` **Retention DELETE is batched.** Max 1000 rows per iteration with commit between batches. |

---

## Feature 1 — Notification Engine

### 1.1 Schema (Migration 006)

Unchanged from Rev 10. Indexes on new empty table — no `CONCURRENTLY` needed.

### 1.2 Body Encryption

```python
body_encrypted = encrypt_field_versioned(plaintext_body)
if body_encrypted is None:
    raise ValueError("Encryption returned None — D9")
```

### 1.3 Notification Generation `[V12-FIX]`

```python
async def generate_daily_notifications(user_id, schedule, target_date, db):
    user = await _get_user_with_tz(user_id, db)

    try:
        user_tz = ZoneInfo(user.timezone)
    except (KeyError, TypeError):
        logger.error("invalid_timezone", extra={
            "user_id": str(user_id), "timezone": user.timezone,
        })
        return

    # ── Morning check-in (immutable — DO NOTHING) ──
    morning_utc = _safe_localize(target_date, time(7, 0), user_tz)
    if morning_utc is None:
        return

    stmt = pg_insert(Notification).values(
        user_id=user_id, type='checkin_morning',
        title='Good morning! Ready to crush today?',
        body_encrypted=encrypt_field_versioned('Your schedule is ready.'),
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

        fire_at_utc = _safe_localize(target_date, parsed_time, user_tz)
        if fire_at_utc is None:
            continue

        fire_at_utc -= timedelta(minutes=10)
        title = f'{(task.title or "Task")[:50]} in 10 minutes'
        body = encrypt_field_versioned(f'Scheduled at {task.scheduled_start}')

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
        await db.execute(stmt)
```

#### `_safe_localize` `[V12-FIX]`

```python
def _safe_localize(
    target_date: date, local_time: time, tz: ZoneInfo
) -> Optional[datetime]:
    """
    Convert local date+time to UTC. Detects DST gaps via full naive
    datetime round-trip comparison (not hour-only).

    V12-FIX: Compares full naive datetime to catch 30-minute DST shifts
    (e.g. Australia/Lord_Howe +10:30 → +11:00).
    """
    try:
        dt = datetime.combine(target_date, local_time, tzinfo=tz)
        utc_dt = dt.astimezone(timezone.utc)

        # V12: Full comparison — catches 30-min shifts
        roundtrip = utc_dt.astimezone(tz)
        expected_naive = datetime.combine(target_date, local_time)
        actual_naive = roundtrip.replace(tzinfo=None)

        if actual_naive != expected_naive:
            logger.info("dst_gap_detected", extra={
                "requested": str(expected_naive),
                "actual": str(actual_naive),
                "date": str(target_date),
                "tz": str(tz),
            })

        return utc_dt
    except Exception as e:
        logger.error("localization_failed", extra={
            "date": str(target_date), "time": str(local_time),
            "tz": str(tz), "error": str(e),
        })
        return None
```

### 1.4 API — Notification Response `[V12-FIX]`

```python
class NotificationResponse(BaseModel):
    id: UUID
    type: str
    title: str
    body: str
    fire_at: Optional[datetime]
    delivered_at: Optional[datetime]
    dismissed_at: Optional[datetime]
    created_at: datetime

    @classmethod
    def from_db(cls, notification: Notification) -> "NotificationResponse":
        # V12-FIX (D22): Graceful degradation on read path.
        # D9 hard-failure applies to WRITES only.
        try:
            body = decrypt_field_versioned(notification.body_encrypted)
        except Exception:
            logger.error("notification_decrypt_failed", extra={
                "notification_id": str(notification.id),
            })
            body = "[encrypted]"

        return cls(
            id=notification.id,
            type=notification.type,
            title=notification.title,
            body=body,
            fire_at=notification.fire_at,
            delivered_at=notification.delivered_at,
            dismissed_at=notification.dismissed_at,
            created_at=notification.created_at,
        )
```

### 1.5 Retention `[V12-FIX]`

```python
async def cleanup_old_notifications():
    """
    V12-FIX (D24): Batched DELETE. Max 1000 rows per iteration.
    Prevents WAL explosion, table locks, and replication lag.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    total_deleted = 0

    async with AsyncSessionLocal() as db:
        while True:
            result = await db.execute(
                sa_delete(Notification).where(
                    Notification.id.in_(
                        select(Notification.id).where(
                            Notification.created_at < cutoff,
                            Notification.dismissed_at.isnot(None),
                        ).limit(1000)
                    )
                )
            )
            await db.commit()
            total_deleted += result.rowcount
            if result.rowcount == 0:
                break

    logger.info("notification_retention_cleanup", extra={
        "deleted_count": total_deleted,
        "cutoff": cutoff.isoformat(),
    })
```

---

## Feature 2 — Recurring Tasks — unchanged
## Feature 3 — Milestones — unchanged

---

## Feature 4 — Rescue Mission

### 4.1–4.3 — unchanged

### 4.2 Migration 007b — CONCURRENT Indexes `[V12: Alembic pattern]`

```python
# alembic/versions/007b_concurrent_indexes.py
from alembic import op
import sqlalchemy as sa

revision = '007b'
down_revision = '007'

def upgrade():
    with op.get_context().autocommit_block():
        op.create_index(
            'ix_tasks_rescue_candidate',
            'tasks',
            ['task_status', 'created_at'],
            postgresql_where=sa.text(
                "goal_id IS NOT NULL AND deleted_at IS NULL"
            ),
            postgresql_concurrently=True,
        )

def downgrade():
    op.drop_index('ix_tasks_rescue_candidate', table_name='tasks')
```

> [!WARNING]
> `[V12]` Requires **Alembic ≥ 1.11** for `autocommit_block()`. Add to requirements.txt pre-flight check.

---

## Feature 5 — Encryption Pipeline

### 5.1 Migration 011

```sql
-- V12: Pre-flight check: SELECT version(); → must be >= 11
ALTER TABLE daily_logs ADD COLUMN evening_note_ciphertext BYTEA;
ALTER TABLE daily_logs ADD COLUMN evening_note_encrypted BOOLEAN DEFAULT FALSE NOT NULL;
-- PG 11+: metadata-only, no table rewrite
```

### 5.1b Dead-Letter Table `[V12-NEW]`

```sql
-- Migration 011b (D23)
CREATE TABLE encryption_dead_letters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_table TEXT NOT NULL,
    source_row_id UUID NOT NULL,
    operation TEXT NOT NULL,  -- 'encrypt', 'decrypt', 'reencrypt'
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);
CREATE INDEX ix_dead_letters_unresolved
  ON encryption_dead_letters (source_table, created_at)
  WHERE resolved_at IS NULL;
```

### 5.2 Encryption Module `[V12-FIX]`

```python
# app/core/encryption.py

import base64, hashlib
from typing import Optional, List
from cryptography.fernet import Fernet
from app.config import settings

def _get_key_for_version(version: int) -> bytes:
    keys: List[str] = settings.ENCRYPTION_KEYS
    if version < 0 or version >= len(keys):
        raise ValueError(f"Invalid key version {version}, have {len(keys)} keys")
    raw = keys[version].encode("utf-8")
    digest = hashlib.sha256(raw).digest()
    return base64.urlsafe_b64encode(digest)

def encrypt_field_versioned(value: Optional[str]) -> Optional[str]:
    if value is None or value == "":
        return value
    version = settings.ACTIVE_KEY_VERSION
    key = _get_key_for_version(version)
    token = Fernet(key).encrypt(value.encode("utf-8")).decode("utf-8")
    return f"v{version}:{token}"

def _parse_version_prefix(value: str) -> tuple[int, str]:
    """
    V12-FIX (I12): Parse version NUMERICALLY.
    'v10:abc' → (10, 'abc'), NOT matched by startswith('v1:').
    """
    if value.startswith("v") and ":" in value[:8]:
        prefix, token = value.split(":", 1)
        try:
            version = int(prefix[1:])
            return version, token
        except ValueError:
            pass
    return 0, value  # Legacy: no prefix → version 0

def decrypt_field_versioned(value: Optional[str]) -> Optional[str]:
    if value is None or value == "":
        return value
    version, token = _parse_version_prefix(value)
    key = _get_key_for_version(version)
    return Fernet(key).decrypt(token.encode("utf-8")).decode("utf-8")

# Aliases — prevent accidental unversioned use
encrypt_field = encrypt_field_versioned
decrypt_field = decrypt_field_versioned
```

### 5.2b Config `[V12-FIX]`

```python
# In Settings class:
ENCRYPTION_ACTIVE: bool = False
ENCRYPTION_MIN_VERSION: int = 12
CODE_VERSION: int = 12
ENCRYPTION_KEYS: list = [""]  # Append-only. Index = version number.
ACTIVE_KEY_VERSION: int = 0
CRON_MAINTENANCE_MODE: bool = False  # V12: for explicit restart pattern

@model_validator(mode="after")
def validate_encryption_keys(self) -> "Settings":
    if self.ACTIVE_KEY_VERSION >= len(self.ENCRYPTION_KEYS):
        raise ValueError(
            f"ACTIVE_KEY_VERSION={self.ACTIVE_KEY_VERSION} >= "
            f"len(ENCRYPTION_KEYS)={len(self.ENCRYPTION_KEYS)}"
        )
    # V12-FIX: Validate ALL keys, not just [0]
    if self.APP_ENV == "production":
        for i, k in enumerate(self.ENCRYPTION_KEYS):
            if not k:
                raise ValueError(f"ENCRYPTION_KEYS[{i}] is empty")
    return self
```

### 5.2c Write Path

```python
async def save_evening_note(daily_log: DailyLog, plaintext: str, db: AsyncSession):
    if (settings.ENCRYPTION_ACTIVE
            and settings.CODE_VERSION >= settings.ENCRYPTION_MIN_VERSION):
        ciphertext = encrypt_field_versioned(plaintext)
        if ciphertext is None:
            raise ValueError("Encryption failed — D9")
        daily_log.evening_note_ciphertext = ciphertext.encode('utf-8')
        daily_log.evening_note_encrypted = True
        daily_log.evening_note = None
    else:
        daily_log.evening_note = plaintext
        daily_log.evening_note_encrypted = False
    await db.flush()
```

### 5.3 Read Path

```python
def get_evening_note(daily_log: DailyLog) -> Optional[str]:
    if daily_log.evening_note_encrypted is True:
        if daily_log.evening_note_ciphertext is None:
            raise ValueError(f"DailyLog {daily_log.id} marked encrypted but NULL")
        return decrypt_field_versioned(
            daily_log.evening_note_ciphertext.decode('utf-8')
        )
    return daily_log.evening_note
```

### 5.4 Forward Migration `[V12-FIX]`

```python
async def migrate_evening_notes():
    """
    V12 fixes:
    1. Composite cursor (created_at, id) — no timestamp tie skips (D20, I13)
    2. encrypt_field_versioned — uniform v{N}: format (D14)
    3. Assert ENCRYPTION_ACTIVE=true (UUIDv4 safety)
    4. Dead letters persisted to DB table (D23)
    """
    assert settings.ENCRYPTION_ACTIVE, (
        "ENCRYPTION_ACTIVE must be True before migration"
    )

    batch_size = 500
    total_migrated = 0
    total_skipped = 0
    consecutive_errors = 0
    MAX_CONSECUTIVE_ERRORS = 10

    # V12: Composite cursor (D20)
    last_created_at = datetime.min.replace(tzinfo=timezone.utc)
    last_id = uuid.UUID('00000000-0000-0000-0000-000000000000')

    while True:
        async with AsyncSessionLocal() as db:
            rows = await db.execute(
                select(DailyLog).where(
                    DailyLog.evening_note.isnot(None),
                    DailyLog.evening_note_encrypted == False,
                    sa.or_(
                        DailyLog.created_at > last_created_at,
                        sa.and_(
                            DailyLog.created_at == last_created_at,
                            DailyLog.id > last_id,
                        ),
                    ),
                ).order_by(
                    DailyLog.created_at, DailyLog.id
                ).limit(batch_size)
            )
            batch = rows.scalars().all()
            if not batch:
                break

            for row in batch:
                last_created_at = row.created_at
                last_id = row.id

                try:
                    original_text = row.evening_note
                    ciphertext = encrypt_field_versioned(original_text)
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
                    consecutive_errors += 1
                    # V12: Persist dead letter to DB (D23)
                    await db.execute(
                        sa.insert(EncryptionDeadLetter).values(
                            source_table='daily_logs',
                            source_row_id=row.id,
                            operation='encrypt',
                            error_message=str(e)[:500],
                        )
                    )
                    logger.error("encryption_migration_row_error", extra={
                        "daily_log_id": str(row.id), "error": str(e),
                    })
                    if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                        await db.commit()
                        raise RuntimeError(
                            f"Circuit breaker: {MAX_CONSECUTIVE_ERRORS} consecutive failures"
                        )

            await db.commit()
            logger.info("encryption_migration_batch", extra={
                "total_migrated": total_migrated,
                "total_skipped": total_skipped,
            })

    logger.info("encryption_migration_complete", extra={
        "total_migrated": total_migrated,
        "total_skipped": total_skipped,
    })
```

### 5.7 Reverse Migration `[V12-FIX]`

```python
async def reverse_migrate_evening_notes():
    """
    V12: Uses composite cursor, versioned decrypt, OCC, DB dead letters.
    """
    assert not settings.ENCRYPTION_ACTIVE, (
        "ENCRYPTION_ACTIVE must be False before reverse migration"
    )

    batch_size = 500
    total_reversed = 0
    last_created_at = datetime.min.replace(tzinfo=timezone.utc)
    last_id = uuid.UUID('00000000-0000-0000-0000-000000000000')

    while True:
        async with AsyncSessionLocal() as db:
            rows = await db.execute(
                select(DailyLog).where(
                    DailyLog.evening_note_encrypted == True,
                    DailyLog.evening_note_ciphertext.isnot(None),
                    sa.or_(
                        DailyLog.created_at > last_created_at,
                        sa.and_(
                            DailyLog.created_at == last_created_at,
                            DailyLog.id > last_id,
                        ),
                    ),
                ).order_by(
                    DailyLog.created_at, DailyLog.id
                ).limit(batch_size)
            )
            batch = rows.scalars().all()
            if not batch:
                break

            for row in batch:
                last_created_at = row.created_at
                last_id = row.id

                try:
                    original_ct = row.evening_note_ciphertext
                    plaintext = decrypt_field_versioned(
                        original_ct.decode('utf-8')
                    )

                    stmt = sa_update(DailyLog).where(
                        DailyLog.id == row.id,
                        DailyLog.evening_note_encrypted == True,
                        DailyLog.evening_note_ciphertext == original_ct,
                    ).values(
                        evening_note=plaintext,
                        evening_note_encrypted=False,
                        evening_note_ciphertext=None,
                    )
                    result = await db.execute(stmt)
                    if result.rowcount == 1:
                        total_reversed += 1

                except Exception as e:
                    await db.execute(
                        sa.insert(EncryptionDeadLetter).values(
                            source_table='daily_logs',
                            source_row_id=row.id,
                            operation='decrypt',
                            error_message=str(e)[:500],
                        )
                    )
                    logger.error("reverse_migration_error", extra={
                        "daily_log_id": str(row.id), "error": str(e),
                    })

            await db.commit()

    logger.info("reverse_migration_complete", extra={
        "total_reversed": total_reversed,
    })
```

### 5.8 Re-Encryption Job `[V12-FIX]`

```python
async def reencrypt_evening_notes():
    """
    V12-FIX (D21):
    - No target_version parameter. Uses ACTIVE_KEY_VERSION.
    - Version comparison is numeric (I12), not startswith.
    - Composite cursor (D20).
    """
    active = settings.ACTIVE_KEY_VERSION
    batch_size = 500
    total = 0
    last_created_at = datetime.min.replace(tzinfo=timezone.utc)
    last_id = uuid.UUID('00000000-0000-0000-0000-000000000000')

    while True:
        async with AsyncSessionLocal() as db:
            rows = await db.execute(
                select(DailyLog).where(
                    DailyLog.evening_note_encrypted == True,
                    DailyLog.evening_note_ciphertext.isnot(None),
                    sa.or_(
                        DailyLog.created_at > last_created_at,
                        sa.and_(
                            DailyLog.created_at == last_created_at,
                            DailyLog.id > last_id,
                        ),
                    ),
                ).order_by(
                    DailyLog.created_at, DailyLog.id
                ).limit(batch_size)
            )
            batch = rows.scalars().all()
            if not batch:
                break

            for row in batch:
                last_created_at = row.created_at
                last_id = row.id

                ct = row.evening_note_ciphertext.decode('utf-8')

                # V12-FIX: Numeric version parse (I12)
                current_version, _ = _parse_version_prefix(ct)
                if current_version == active:
                    continue

                try:
                    plaintext = decrypt_field_versioned(ct)
                    new_ct = encrypt_field_versioned(plaintext)
                    original_ct = row.evening_note_ciphertext

                    stmt = sa_update(DailyLog).where(
                        DailyLog.id == row.id,
                        DailyLog.evening_note_ciphertext == original_ct,
                    ).values(
                        evening_note_ciphertext=new_ct.encode('utf-8'),
                    )
                    result = await db.execute(stmt)
                    if result.rowcount == 1:
                        total += 1

                except Exception as e:
                    await db.execute(
                        sa.insert(EncryptionDeadLetter).values(
                            source_table='daily_logs',
                            source_row_id=row.id,
                            operation='reencrypt',
                            error_message=str(e)[:500],
                        )
                    )
                    logger.error("reencrypt_error", extra={
                        "daily_log_id": str(row.id), "error": str(e),
                    })

            await db.commit()

    logger.info("reencryption_complete", extra={"total": total})
```

### 5.9 Health Endpoint `[V12-NEW]`

```python
# In app/routes/health.py

@router.get("/health")
async def health_check():
    return {
        "status": "ok",
        "code_version": settings.CODE_VERSION,
        "encryption_active": settings.ENCRYPTION_ACTIVE,
    }
```

---

## Feature 6 — Heatmap Cache — unchanged (uses same Alembic CONCURRENTLY pattern as §4.2)
## Health Profile — unchanged
