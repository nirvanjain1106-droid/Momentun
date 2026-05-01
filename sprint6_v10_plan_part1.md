# Sprint 6 — Consolidated Implementation Plan (Revision 10 — Final)

> [!IMPORTANT]
> **Single authoritative document.** Supersedes all prior revisions including Rev 9.
> **Changes from Rev 9** are marked with `[V10-FIX]` throughout.

---

## Architectural Invariants

| Invariant | Evidence |
|-----------|----------|
| **Transaction:** `get_db()` auto-commits/rollbacks. | [database.py#L34-L47](file:///c:/Users/nirva/Downloads/Momentum%20API/app/database.py#L34-L47) |
| **Isolation:** PostgreSQL READ COMMITTED. WHERE-guarded UPDATE re-evaluates after row lock. | PostgreSQL default |
| **Row lock on unique conflict:** B blocks until A commits. B sees A's committed data. | PostgreSQL MVCC |
| **Session-per-day:** Week generation: separate `AsyncSessionLocal()` per day. `Semaphore(3)`. | [schedule_service.py#L586-L604](file:///c:/Users/nirva/Downloads/Momentum%20API/app/services/schedule_service.py#L586-L604) |
| **Single pool:** Advisory lock + request sessions share `engine.pool`. Pool: `size=10, max_overflow=20`. | [database.py#L15-L17](file:///c:/Users/nirva/Downloads/Momentum%20API/app/database.py#L15-L17) |
| **Bankruptcy scopes to past only.** | [schedule_service.py#L463-L477](file:///c:/Users/nirva/Downloads/Momentum%20API/app/services/schedule_service.py#L463-L477) |
| **Task statuses:** `active`, `deferred`, `parked`, `completed`, `expired` only. | [goal.py#L363-L367](file:///c:/Users/nirva/Downloads/Momentum%20API/app/models/goal.py#L363-L367) |
| **DailyLog.evening_note is TEXT** — cannot store raw `bytes`. | [goal.py#L452](file:///c:/Users/nirva/Downloads/Momentum%20API/app/models/goal.py#L452) |
| `[V10-FIX]` **Encryption returns str** — `encrypt_field()` returns Fernet base64 str, not raw BYTEA. Notification `body_encrypted` must be TEXT or cast. | [encryption.py#L28-L34](file:///c:/Users/nirva/Downloads/Momentum%20API/app/core/encryption.py#L28-L34) |
| `[V10-FIX]` **ON CONFLICT ON CONSTRAINT requires a named CONSTRAINT, not a UNIQUE INDEX.** For partial unique indexes, use `index_elements` + `index_where`. | PostgreSQL docs |
| `[V10-FIX]` **PostgreSQL NULL ≠ NULL in unique indexes.** Nullable columns in unique indexes do NOT prevent duplicate NULLs. | PostgreSQL MVCC |

---

## Design Decisions

| # | Decision |
|---|----------|
| D1 | **Pure Poll + Explicit ACK** for notifications |
| D2 | **Threshold with auto-skip** for milestones (with exhaustion guard) |
| D3 | **Goal-linked only** for rescue missions |
| D4 | **Decay-on-read** for trajectory bonus |
| D5 | **Encrypt notification body by default.** `body_encrypted TEXT NOT NULL` (Fernet base64). `[V10-FIX]` Changed from BYTEA to TEXT to match `encrypt_field()` return type. |
| D6 | **Health fields stay nullable.** Solver defaults. |
| D7 | **Normalize FKs** on Notification: `rescue_task_id`, `reminder_task_id` — indexed. |
| D8 | **`source_date DATE`** on Task for recurring idempotency. |
| D9 | **Hard failure on encryption error.** No plaintext fallback. 500 → rollback → ops. |
| D10 | **Increment-first (reservation)** for recurring tasks. |
| D11 | `[V10-FIX]` **Upsert for mutable notifications.** Task reminders: `ON CONFLICT DO UPDATE` using `index_elements` + `index_where` (NOT `constraint=` name, which fails for partial unique indexes). Checkins: `DO NOTHING`. |
| D12 | **DB-level safety net for dedup.** Python checks prevent unnecessary work; DB unique indexes are the absolute guards. `[V10-FIX]` Nullable FK columns must have `IS NOT NULL` in partial index predicates. |
| D13 | **OCC for data migrations.** Batch migration scripts use `WHERE column == original_value AND encrypted_flag == False` guards. `[V10-FIX]` Added encrypted flag guard. |
| D14 | `[V10-NEW]` **Key versioning for encryption rotation.** Store `key_version` integer prepended to ciphertext. Decryption routes to correct key. |
| D15 | `[V10-NEW]` **Upsert MUST preserve ACK state.** `dismissed_at`/`delivered_at` are NEVER reset in `set_` dict. Update only fires on unacknowledged rows. |

---

## Step 0 — Pre-Conditions (unchanged)

---

## Feature 1 — Notification Engine

### 1.1 Schema (Migration 006) `[V10-FIX]`

```sql
CREATE TABLE notifications (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type             VARCHAR(30) NOT NULL,
    title            TEXT NOT NULL,
    body_encrypted   TEXT NOT NULL,  -- V10: TEXT NOT NULL (was BYTEA nullable)
    metadata         JSONB DEFAULT '{}',
    fire_at          TIMESTAMPTZ,
    schedule_date    DATE,
    rescue_task_id   UUID REFERENCES tasks(id) ON DELETE SET NULL,
    reminder_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    delivered_at     TIMESTAMPTZ,
    dismissed_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT ck_notification_type CHECK (
        type IN ('checkin_morning', 'checkin_evening', 'task_reminder', 'rescue_mission')
    )
);

-- Checkin dedup (immutable — DO NOTHING)
-- V10: Added schedule_date IS NOT NULL to prevent NULL bypass
CREATE UNIQUE INDEX uq_notification_per_user_type_day
  ON notifications (user_id, type, schedule_date)
  WHERE type IN ('checkin_morning', 'checkin_evening')
    AND schedule_date IS NOT NULL;

-- Task reminder dedup (mutable — DO UPDATE via index_elements) (D11, D15)
-- V10: Added reminder_task_id IS NOT NULL to prevent NULL bypass
CREATE UNIQUE INDEX uq_notification_task_reminder
  ON notifications (user_id, reminder_task_id, schedule_date)
  WHERE type = 'task_reminder'
    AND reminder_task_id IS NOT NULL
    AND schedule_date IS NOT NULL;

-- Rescue pending dedup (D12)
-- V10: Added rescue_task_id IS NOT NULL
CREATE UNIQUE INDEX uq_notification_rescue_pending
  ON notifications (rescue_task_id)
  WHERE type = 'rescue_mission'
    AND dismissed_at IS NULL
    AND rescue_task_id IS NOT NULL;

-- V10: All indexes use CONCURRENTLY in production
-- (In migration, use raw SQL with CONCURRENTLY outside transaction)
CREATE INDEX CONCURRENTLY ix_notifications_fire_at
  ON notifications (user_id, fire_at DESC NULLS LAST, created_at DESC);

-- V10: Partial index for poll query performance
CREATE INDEX CONCURRENTLY ix_notifications_active_poll
  ON notifications (user_id, fire_at DESC NULLS LAST)
  WHERE dismissed_at IS NULL;

CREATE INDEX CONCURRENTLY ix_notifications_created_at
  ON notifications (created_at);

CREATE INDEX CONCURRENTLY ix_notification_rescue_task
  ON notifications (rescue_task_id, created_at DESC)
  WHERE rescue_task_id IS NOT NULL;
```

> [!IMPORTANT]
> **V10 Changes from Rev 9:**
> 1. `body_encrypted` is `TEXT NOT NULL` (matches `encrypt_field()` return type; enforces D5/D9)
> 2. All partial indexes add `IS NOT NULL` on nullable FK columns (prevents NULL bypass of D12)
> 3. All non-unique indexes use `CONCURRENTLY` (prevents write-lock outage)
> 4. Added `ix_notifications_active_poll` partial index for poll performance
>
> **Note on CONCURRENTLY:** Unique indexes on a new table during creation don't need CONCURRENTLY (table is empty). The CONCURRENTLY keyword is for indexes added to existing tables in later migrations.

### 1.2 Body Encryption (D5 + D9)

```python
# V10: encrypt_field returns str (Fernet base64), matching TEXT column
body_encrypted = encrypt_field(plaintext_body)
if body_encrypted is None:
    raise ValueError("Encryption returned None — D9 violation")
```

### 1.3 Notification Generation `[V10-FIX]`

```python
async def generate_daily_notifications(user_id, schedule, target_date, db):
    # V10: Validate timezone before use (prevents ZoneInfo crash)
    user = await _get_user_with_tz(user_id, db)
    try:
        user_tz = ZoneInfo(user.timezone)
    except (KeyError, TypeError):
        logger.error("invalid_timezone", extra={
            "user_id": str(user_id), "timezone": user.timezone,
        })
        return  # Skip this user, don't crash entire batch

    # ── Morning check-in (immutable — DO NOTHING) ────────────
    # V10: Handle DST gap — use fold=0 and normalize
    try:
        local_morning = datetime.combine(target_date, time(7, 0), tzinfo=user_tz)
    except Exception:
        # DST gap: 07:00 doesn't exist, use 08:00 as fallback
        local_morning = datetime.combine(target_date, time(8, 0), tzinfo=user_tz)

    stmt = pg_insert(Notification).values(
        user_id=user_id, type='checkin_morning',
        title='Good morning! Ready to crush today?',
        body_encrypted=encrypt_field('Your schedule is ready.'),
        fire_at=local_morning.astimezone(timezone.utc),
        schedule_date=target_date,
    ).on_conflict_do_nothing()
    await db.execute(stmt)

    # ── Task reminders (mutable — upsert by index_elements) (D11, D15) ──
    for task in schedule.tasks:
        if task.scheduled_start is None:
            continue

        # V10: Defensive parse + null title guard
        try:
            parsed_time = _parse_time(task.scheduled_start)
        except (ValueError, TypeError):
            logger.warning("bad_scheduled_start", extra={
                "task_id": str(task.id), "value": task.scheduled_start,
            })
            continue

        try:
            local_fire = datetime.combine(target_date, parsed_time, tzinfo=user_tz)
        except Exception:
            local_fire = datetime.combine(
                target_date, time(parsed_time.hour + 1, 0), tzinfo=user_tz
            )

        fire_at = local_fire.astimezone(timezone.utc) - timedelta(minutes=10)
        title = f'{(task.title or "Task")[:50]} in 10 minutes'  # V10: null guard
        body = encrypt_field(f'Scheduled at {task.scheduled_start}')

        # V10-FIX: Use index_elements + index_where (not constraint= name)
        # V10-FIX: Do NOT reset dismissed_at/delivered_at (D15)
        # V10-FIX: Only update unacknowledged rows
        stmt = pg_insert(Notification).values(
            user_id=user_id, type='task_reminder',
            title=title,
            body_encrypted=body,
            fire_at=fire_at,
            schedule_date=target_date,
            reminder_task_id=task.id,
        ).on_conflict_do_update(
            index_elements=['user_id', 'reminder_task_id', 'schedule_date'],
            index_where=(
                (Notification.type == 'task_reminder')
                & (Notification.reminder_task_id.isnot(None))
                & (Notification.schedule_date.isnot(None))
            ),
            set_={
                'fire_at': fire_at,
                'body_encrypted': body,
                'title': title,
                # V10: dismissed_at and delivered_at NOT in set_
            },
            where=(
                Notification.dismissed_at.is_(None)
                & Notification.delivered_at.is_(None)
            ),
        )
        await db.execute(stmt)

    logger.info("notifications_generated", extra={
        "user_id": str(user_id), "schedule_date": target_date.isoformat(),
    })
```

> [!IMPORTANT]
> **V10 key changes in 1.3:**
> 1. `constraint='uq_notification_task_reminder'` → `index_elements` + `index_where` (fixes SQLAlchemy crash)
> 2. `dismissed_at: None, delivered_at: None` removed from `set_` (fixes resurrection bug)
> 3. Added `where=` clause so update only fires on unacknowledged rows (D15)
> 4. Timezone validation with `try/except` (prevents `ZoneInfo` crash)
> 5. DST gap handling with fallback hour
> 6. Null title guard: `(task.title or "Task")[:50]`
> 7. `_parse_time` wrapped in `try/except` with skip + log

### 1.4 API — GET + POST /ack — unchanged
### 1.5 Retention — unchanged

---

## Feature 2 — Recurring Task Rules — unchanged from Rev 8

---

## Feature 3 — Goal Milestones — unchanged from Rev 8

---

## Feature 4 — Rescue Mission

### 4.1 Rescue Launcher — unchanged from Rev 8 (Python dedup + DB safety net)

### 4.2 Migration 007b Addition — Rescue Candidate Index `[V10-FIX]`

```sql
-- V10: Use CONCURRENTLY (tasks table already exists in prod)
CREATE INDEX CONCURRENTLY ix_tasks_rescue_candidate
  ON tasks (task_status, created_at)
  WHERE goal_id IS NOT NULL AND deleted_at IS NULL;
```

### 4.3 Rate Limiting — INCR-First Lua — unchanged
### 4.4 Trajectory Bonus (D4) — unchanged

---

## Feature 5 — Encryption Pipeline

### 5.1 Migration 011 — Separate BYTEA Column — unchanged

```sql
ALTER TABLE daily_logs ADD COLUMN evening_note_ciphertext BYTEA;
ALTER TABLE daily_logs ADD COLUMN evening_note_encrypted BOOLEAN DEFAULT FALSE NOT NULL;
-- V10: Added NOT NULL with DEFAULT FALSE to prevent NULL boolean ambiguity
```

### 5.2 Write Path — Hard Failure (D9) `[V10-FIX]`

```python
async def save_evening_note(daily_log: DailyLog, plaintext: str, db: AsyncSession):
    """
    Write path for evening notes. Checks ENCRYPTION_ACTIVE flag.
    V10: Explicitly deployed at Step 7. Handles flag=false correctly.
    """
    if settings.ENCRYPTION_ACTIVE:
        ciphertext = encrypt_field(plaintext)
        if ciphertext is None:
            raise ValueError("Encryption failed — D9: hard failure, no plaintext fallback")
        daily_log.evening_note_ciphertext = ciphertext.encode('utf-8')  # TEXT→BYTEA
        daily_log.evening_note_encrypted = True
        daily_log.evening_note = None  # Clear plaintext
    else:
        daily_log.evening_note = plaintext
        daily_log.evening_note_encrypted = False
    await db.flush()
```

### 5.3 Read Path — Defensive Column-Priority Decryption `[V10-FIX]`

```python
def get_evening_note(daily_log: DailyLog) -> Optional[str]:
    """
    V10-FIX: Explicit `is True` check (treats NULL as "not encrypted").
    Raises on integrity violations instead of silently returning wrong data.
    """
    if daily_log.evening_note_encrypted is True:  # V10: explicit is True
        if daily_log.evening_note_ciphertext is None:
            raise ValueError(
                f"DailyLog {daily_log.id} marked encrypted but ciphertext is NULL"
            )
        return decrypt_field(
            daily_log.evening_note_ciphertext.decode('utf-8')
        )  # D9: exception → 500

    # V10: Assert consistency — if not encrypted, ciphertext should be NULL
    if daily_log.evening_note_ciphertext is not None:
        logger.warning("data_integrity_unexpected_ciphertext", extra={
            "daily_log_id": str(daily_log.id),
        })

    return daily_log.evening_note  # Legacy plaintext
```

### 5.4 Data Migration Script — OCC-Guarded (D13) `[V10-FIX]`

```python
async def migrate_evening_notes():
    """
    Batch-encrypt existing plaintext evening_note → evening_note_ciphertext.
    V10 fixes: ORDER BY, encrypted flag guard, per-row error handling,
    progress tracking, circuit breaker.
    """
    batch_size = 500
    total_migrated = 0
    total_skipped = 0
    total_errors = 0
    consecutive_errors = 0
    MAX_CONSECUTIVE_ERRORS = 10  # V10: circuit breaker

    # V10: Progress tracking
    async with AsyncSessionLocal() as count_db:
        total_remaining = await count_db.scalar(
            select(func.count()).where(
                DailyLog.evening_note.isnot(None),
                DailyLog.evening_note_encrypted == False,
            )
        )
    logger.info("encryption_migration_start", extra={"total_rows": total_remaining})

    last_seen_id = uuid.UUID('00000000-0000-0000-0000-000000000000')

    while True:
        async with AsyncSessionLocal() as db:
            # V10-FIX: ORDER BY id for deterministic cursor pagination
            rows = await db.execute(
                select(DailyLog).where(
                    DailyLog.evening_note.isnot(None),
                    DailyLog.evening_note_encrypted == False,
                    DailyLog.id > last_seen_id,  # V10: cursor
                ).order_by(DailyLog.id).limit(batch_size)
            )
            batch = rows.scalars().all()
            if not batch:
                break

            batch_migrated = 0
            for row in batch:
                last_seen_id = row.id  # V10: advance cursor

                # V10-FIX: Per-row error handling with circuit breaker
                try:
                    original_text = row.evening_note
                    ciphertext = encrypt_field(original_text)
                    if ciphertext is None:
                        raise ValueError("encrypt_field returned None")

                    # V10-FIX: OCC guard + encrypted flag guard
                    stmt = sa_update(DailyLog).where(
                        DailyLog.id == row.id,
                        DailyLog.evening_note == original_text,  # D13: OCC
                        DailyLog.evening_note_encrypted == False,  # V10-FIX
                    ).values(
                        evening_note_ciphertext=ciphertext.encode('utf-8'),
                        evening_note_encrypted=True,
                        evening_note=None,
                    )
                    result = await db.execute(stmt)

                    if result.rowcount == 1:
                        batch_migrated += 1
                        total_migrated += 1
                        consecutive_errors = 0
                    else:
                        total_skipped += 1
                        logger.warning("encryption_migration_skipped", extra={
                            "daily_log_id": str(row.id),
                        })

                except Exception as e:
                    total_errors += 1
                    consecutive_errors += 1
                    logger.error("encryption_migration_row_error", extra={
                        "daily_log_id": str(row.id),
                        "error": str(e),
                    })
                    if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                        logger.critical("encryption_migration_circuit_breaker", extra={
                            "total_migrated": total_migrated,
                            "total_errors": total_errors,
                        })
                        raise RuntimeError(
                            f"Circuit breaker: {MAX_CONSECUTIVE_ERRORS} consecutive failures"
                        )

            await db.commit()
            logger.info("encryption_migration_batch", extra={
                "batch_migrated": batch_migrated,
                "total_migrated": total_migrated,
                "total_skipped": total_skipped,
                "total_errors": total_errors,
            })

    logger.info("encryption_migration_complete", extra={
        "total_migrated": total_migrated,
        "total_skipped": total_skipped,
        "total_errors": total_errors,
    })
```

### 5.5 Migration 012 — Post-Migration Cleanup — unchanged
> [!WARNING]
> `[V10-FIX]` Do NOT run Migration 012 (drop `evening_note` column) until at least one full release cycle has passed and rollback is no longer needed.

### 5.6 Key Rotation `[V10-NEW]`

```python
# V10-NEW: Key versioning strategy (D14)
#
# Ciphertext format: "v{version}:{fernet_token}"
# Example: "v1:gAAAAABh..."
#
# encrypt_field_versioned() prepends version.
# decrypt_field_versioned() reads version, routes to correct key.
#
# Rotation runbook:
# 1. Add new key to ENCRYPTION_KEYS list (index = version)
# 2. Set ACTIVE_KEY_VERSION = new index
# 3. New writes use new key. Old reads route to old key.
# 4. Run background re-encryption job to migrate old ciphertext.
#
# Config:
#   ENCRYPTION_KEYS: list[str]  # index = version number
#   ACTIVE_KEY_VERSION: int     # which key to use for writes

ENCRYPTION_KEYS = settings.ENCRYPTION_KEYS  # ["key_v0", "key_v1", ...]
ACTIVE_KEY_VERSION = settings.ACTIVE_KEY_VERSION  # e.g. 0

def encrypt_field_versioned(value: Optional[str]) -> Optional[str]:
    if value is None or value == "":
        return value
    raw = encrypt_field_with_key(value, ENCRYPTION_KEYS[ACTIVE_KEY_VERSION])
    return f"v{ACTIVE_KEY_VERSION}:{raw}"

def decrypt_field_versioned(value: Optional[str]) -> Optional[str]:
    if value is None or value == "":
        return value
    if value.startswith("v") and ":" in value[:5]:
        version_str, token = value.split(":", 1)
        version = int(version_str[1:])
        return decrypt_field_with_key(token, ENCRYPTION_KEYS[version])
    # Legacy (no version prefix) — use key 0
    return decrypt_field_with_key(value, ENCRYPTION_KEYS[0])
```

### 5.7 Reverse Migration Script `[V10-NEW]`

```python
# V10-NEW: Rollback script — decrypt ciphertext back to plaintext
# ONLY for emergency rollback. Requires ENCRYPTION_KEYS to be available.

async def reverse_migrate_evening_notes():
    """Decrypt evening_note_ciphertext back to evening_note (plaintext)."""
    batch_size = 500
    last_seen_id = uuid.UUID('00000000-0000-0000-0000-000000000000')

    while True:
        async with AsyncSessionLocal() as db:
            rows = await db.execute(
                select(DailyLog).where(
                    DailyLog.evening_note_encrypted == True,
                    DailyLog.evening_note_ciphertext.isnot(None),
                    DailyLog.id > last_seen_id,
                ).order_by(DailyLog.id).limit(batch_size)
            )
            batch = rows.scalars().all()
            if not batch:
                break

            for row in batch:
                last_seen_id = row.id
                try:
                    plaintext = decrypt_field(
                        row.evening_note_ciphertext.decode('utf-8')
                    )
                    row.evening_note = plaintext
                    row.evening_note_encrypted = False
                    row.evening_note_ciphertext = None
                except Exception as e:
                    logger.error("reverse_migration_error", extra={
                        "daily_log_id": str(row.id), "error": str(e),
                    })

            await db.commit()
```

---

## Feature 6 — Heatmap Cache — unchanged

---

## Health Profile — D6 — unchanged
