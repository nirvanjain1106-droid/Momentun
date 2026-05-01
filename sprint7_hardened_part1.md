# Sprint 7 — Architecture, Schema & Core Code (Hardened — Final)

> **Self-contained document.** Part 1 of 3. No external revision references required.
> All invariants, decisions, DDL, and service code are fully specified here.
> **Hardening source:** Senior Architect Review — all P0 blockers (C1–C4) and P1 majors (M1–M5) resolved.

---

## 1. Architectural Invariants

> Inherits I1–I25 from Sprint 6 v17. Sprint 7 additions below.

| # | Invariant |
|---|-----------|
| I26 | **Recurring task duplicate handling uses `SAVEPOINT` (`begin_nested()`), never `db.rollback()`.** Outer transaction integrity must survive inner dedup conflicts. (C3 fix) |
| I27 | **All FK cascade targets require covering indexes.** `ON DELETE CASCADE` on `goal_id` or `user_id` without an index causes sequential scan → table-level lock during parent deletion. (C1 fix) |
| I28 | **No module-level dict caches in multi-worker deployments.** Uvicorn workers are separate processes; Python dicts are per-process. Use Redis or DB-level optimization instead. (C2 fix) |
| I29 | **Notification `body_ciphertext` is `TEXT`** (base64-encoded), consistent with `daily_logs.evening_note_ciphertext`. Never `BYTEA` — avoids encode/decode layer mismatch. (M4 fix) |
| I30 | **`get_evening_note()` returns `None` on decrypt failure**, not `"[encrypted]"`. Prometheus counter + structured error log provide debuggability without leaking placeholders to clients. (C4 fix, aligns with D33) |
| I31 | **Rescue notification dedup uses constraint name in `ON CONFLICT`**, never column+where reconstruction. Consistent with D11 pattern for task reminders. (M1 fix) |
| I32 | **Batch cleanup operations use `SKIP LOCKED`.** Prevents notification/retention crons from blocking concurrent user reads. Consistent with Sprint 6 D34 pattern. (M2 fix) |
| I33 | **`days_of_week` is validated as `list[int]` with values 0–6 (ISO weekday)** at the Pydantic schema layer. Sorted and deduplicated on input. |
| I34 | **Notification poll queries filter `dismissed_at IS NULL`** to leverage partial indexes on active notifications. |

---

## 2. Design Decisions

> Inherits D1–D40 from Sprint 6 v17. Sprint 7 additions below.

| # | Decision |
|---|----------|
| D41 | **Pure Poll + Explicit ACK** for notifications. No WebSocket push in v1. GET returns pending; POST /ack marks delivered/dismissed. |
| D42 | **Threshold with auto-skip** for milestones. Exhaustion guard prevents infinite evaluation loops when all milestones are complete. |
| D43 | **Goal-linked only** for rescue missions. No orphan rescue tasks. `goal_id IS NOT NULL` enforced by candidate index. |
| D44 | **Decay-on-read** for trajectory bonus. Bonus percentage decreases over time; reading triggers recalculation. |
| D45 | **Notification body encryption uses `TEXT` column** (`body_ciphertext`), not `BYTEA`. `encrypt_field_versioned()` returns base64 string. Consistent with `daily_logs.evening_note_ciphertext` (Text at [goal.py#L454](file:///c:/Users/nirva/Downloads/Momentum%20API/app/models/goal.py#L454)). |
| D46 | **Increment-first (reservation)** for recurring tasks (D10 pattern). Counter incremented before task creation; rollback on failure decrements. |
| D47 | **Upsert for mutable notifications** (task reminders: `ON CONFLICT DO UPDATE`). Checkins: `DO NOTHING`. Rescue: `DO NOTHING` by constraint name. All conflict targets reference constraints **by name**, not by reconstructing elements + where clause. |
| D48 | **DB-level safety net for dedup.** Python pre-checks prevent unnecessary work; DB unique indexes are the absolute guards. |
| D49 | **Heatmap cache removed.** The covering index on `daily_logs(user_id, log_date)` + direct query (90 rows max) is sufficient. No Python dict cache. Redis cache deferred to post-Sprint 7 if latency exceeds 50ms P95. |
| D50 | **`DEFAULT_TIMEZONE` constant** extracted to `app/core/constants.py`. All `getattr(user, "timezone", ...)` fallbacks reference this constant instead of hardcoding `"Asia/Kolkata"`. |

---

## 3. Schema — Migration 006 (Notification Table)

```sql
CREATE TABLE notifications (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type             VARCHAR(30) NOT NULL,
    title            TEXT NOT NULL,
    body_ciphertext  TEXT,                    -- D45: TEXT not BYTEA, base64 encoded
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

-- I27: Covering index on user_id FK for cascade deletes
CREATE INDEX ix_notifications_user_id ON notifications (user_id);

-- Checkin dedup (immutable — DO NOTHING)
CREATE UNIQUE INDEX uq_notification_per_user_type_day
  ON notifications (user_id, type, schedule_date)
  WHERE type IN ('checkin_morning', 'checkin_evening');

-- Task reminder dedup (mutable — DO UPDATE via constraint name) (D47)
CREATE UNIQUE INDEX uq_notification_task_reminder
  ON notifications (user_id, reminder_task_id, schedule_date)
  WHERE type = 'task_reminder';

-- Rescue pending dedup (D48, I31)
CREATE UNIQUE INDEX uq_notification_rescue_pending
  ON notifications (rescue_task_id)
  WHERE type = 'rescue_mission'
    AND dismissed_at IS NULL
    AND delivered_at IS NULL;

-- Poll query index — I34: filtered by dismissed_at IS NULL
CREATE INDEX ix_notifications_active_poll
  ON notifications (user_id, fire_at DESC NULLS LAST, created_at DESC)
  WHERE dismissed_at IS NULL;

-- Retention cleanup index
CREATE INDEX ix_notifications_dismissed_at
  ON notifications (dismissed_at)
  WHERE dismissed_at IS NOT NULL;

-- FK covering indexes for cascade safety
CREATE INDEX ix_notification_rescue_task
  ON notifications (rescue_task_id, created_at DESC) WHERE rescue_task_id IS NOT NULL;
CREATE INDEX ix_notification_reminder_task
  ON notifications (reminder_task_id) WHERE reminder_task_id IS NOT NULL;
```

---

## 4. Schema — Migration 007 (Recurring Task Rules)

```sql
CREATE TABLE recurring_task_rules (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_id          UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    title            VARCHAR(200) NOT NULL,
    task_type        VARCHAR(30) NOT NULL,
    duration_mins    INTEGER NOT NULL,
    priority         INTEGER NOT NULL DEFAULT 3,
    days_of_week     INTEGER[] NOT NULL,         -- I33: 0-6 ISO weekday
    scheduled_start  VARCHAR(5),                 -- "HH:MM" or NULL
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    max_instances     INTEGER DEFAULT NULL,       -- NULL = unlimited
    instances_created INTEGER NOT NULL DEFAULT 0, -- D46: reservation counter
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT ck_recurring_task_type CHECK (
        task_type IN ('study', 'practice', 'review', 'exercise', 'reading', 'other')
    ),
    CONSTRAINT ck_recurring_priority CHECK (priority BETWEEN 1 AND 5)
);

-- I27: Covering indexes for cascade deletes
CREATE INDEX ix_recurring_task_rules_user_id ON recurring_task_rules (user_id);
CREATE INDEX ix_recurring_task_rules_goal_id ON recurring_task_rules (goal_id);

-- Active rules lookup
CREATE INDEX ix_recurring_task_rules_active
  ON recurring_task_rules (user_id, is_active)
  WHERE is_active = TRUE;
```

### 4.1 Migration 007b — Task Columns + Rescue Index

```sql
-- Source tracking for recurring task idempotency
ALTER TABLE tasks ADD COLUMN source_rule_id UUID REFERENCES recurring_task_rules(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN source_date DATE;

-- Idempotency guard: one task per rule per date
CREATE UNIQUE INDEX uq_task_per_rule_per_date
  ON tasks (source_rule_id, source_date)
  WHERE source_rule_id IS NOT NULL AND deleted_at IS NULL;

-- Rescue candidate index (D43)
CREATE INDEX ix_tasks_rescue_candidate
  ON tasks (task_status, created_at)
  WHERE goal_id IS NOT NULL AND deleted_at IS NULL;
```

---

## 5. Schema — Migration 008 (Goal Milestones)

```sql
CREATE TABLE goal_milestones (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_id          UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    title            VARCHAR(200) NOT NULL,
    description      TEXT,
    target_value     FLOAT NOT NULL,
    current_value    FLOAT NOT NULL DEFAULT 0,
    metric_type      VARCHAR(30) NOT NULL DEFAULT 'completion_rate',
    status           VARCHAR(20) NOT NULL DEFAULT 'pending',
    sequence_order   INTEGER NOT NULL DEFAULT 0,
    completed_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT ck_milestone_status CHECK (
        status IN ('pending', 'in_progress', 'completed', 'skipped')
    ),
    CONSTRAINT ck_milestone_metric CHECK (
        metric_type IN ('completion_rate', 'study_hours', 'streak_days', 'tasks_completed')
    )
);

-- C1 FIX: Covering indexes on BOTH FK columns for cascade delete safety (I27)
CREATE INDEX ix_goal_milestones_user_id ON goal_milestones (user_id);
CREATE INDEX ix_goal_milestones_goal_id ON goal_milestones (goal_id);

-- Active milestone lookup
CREATE INDEX ix_goal_milestones_active
  ON goal_milestones (goal_id, sequence_order)
  WHERE status IN ('pending', 'in_progress');
```

> **C1 Resolution:** Without `ix_goal_milestones_user_id`, deleting a user triggers sequential scan of `goal_milestones` to find cascade targets → table-level lock. Without `ix_goal_milestones_goal_id`, deleting a goal has the same problem. Both indexes prevent this.

---

## 6. Schema — Migration 009 (Heatmap Covering Index)

```sql
-- D49: No Python dict cache. This index is the performance optimization.
CREATE INDEX CONCURRENTLY ix_daily_logs_heatmap
  ON daily_logs (user_id, log_date)
  INCLUDE (tasks_scheduled, tasks_completed, completion_rate, mood_score);
```

> **C2 Resolution:** The heatmap cache feature (module-level dict) is **removed**. This covering index makes `get_heatmap()` query efficient without any caching layer. The existing implementation at [insights_service.py#L1232–1282](file:///c:/Users/nirva/Downloads/Momentum%20API/app/services/insights_service.py#L1232-L1282) queries directly — no change needed.

---

## 7. Schema — Migration 010 (Trajectory Bonus on Goal)

```sql
ALTER TABLE goals ADD COLUMN rescue_bonus_pct FLOAT DEFAULT 0.0;
ALTER TABLE goals ADD COLUMN rescue_bonus_expires_at TIMESTAMPTZ;
```

---

## 8. Notification Generation Service

```python
# app/services/notification_service.py

import logging
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.encryption import encrypt_field_versioned
from app.models.notification import Notification

logger = logging.getLogger(__name__)


async def generate_daily_notifications(user_id, schedule, target_date, db):
    user = await _get_user_with_tz(user_id, db)
    user_tz = ZoneInfo(user.timezone)

    # ── Morning check-in (immutable — DO NOTHING) ────────────
    local_morning = datetime.combine(target_date, time(7, 0), tzinfo=user_tz)
    stmt = pg_insert(Notification).values(
        user_id=user_id, type='checkin_morning',
        title='Good morning! Ready to crush today?',
        body_ciphertext=encrypt_field_versioned('Your schedule is ready.'),  # D45: TEXT
        fire_at=local_morning.astimezone(timezone.utc),
        schedule_date=target_date,
    ).on_conflict_do_nothing()      # constraint auto-matched by partial unique index
    await db.execute(stmt)

    # ── Task reminders (mutable — upsert by constraint name) (D47) ──
    for task in schedule.tasks:
        if task.scheduled_start is None:
            continue
        local_fire = datetime.combine(
            target_date, _parse_time(task.scheduled_start), tzinfo=user_tz
        )
        fire_at = local_fire.astimezone(timezone.utc) - timedelta(minutes=10)
        title = f'{task.title[:50]} in 10 minutes'
        body = encrypt_field_versioned(f'Scheduled at {task.scheduled_start}')

        stmt = pg_insert(Notification).values(
            user_id=user_id, type='task_reminder',
            title=title,
            body_ciphertext=body,                # D45: TEXT column
            fire_at=fire_at,
            schedule_date=target_date,
            reminder_task_id=task.id,
        ).on_conflict_do_update(
            constraint='uq_notification_task_reminder',  # D47: by name
            set_={
                'fire_at': fire_at,
                'body_ciphertext': body,
                'title': title,
                'dismissed_at': None,
                'delivered_at': None,
            },
        )
        await db.execute(stmt)

    # ── Evening check-in ──
    local_evening = datetime.combine(target_date, time(20, 0), tzinfo=user_tz)
    stmt = pg_insert(Notification).values(
        user_id=user_id, type='checkin_evening',
        title='Time to reflect — how did today go?',
        body_ciphertext=encrypt_field_versioned('Log your evening review.'),
        fire_at=local_evening.astimezone(timezone.utc),
        schedule_date=target_date,
    ).on_conflict_do_nothing()
    await db.execute(stmt)

    logger.info("notifications_generated", extra={
        "user_id": str(user_id), "schedule_date": target_date.isoformat(),
    })
```

---

## 9. Recurring Task Service — SAVEPOINT Pattern (C3 Fix)

```python
# app/services/recurring_task_service.py

import logging
from datetime import date
from dataclasses import dataclass

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.goal import Task
from app.models.recurring import RecurringTaskRule

logger = logging.getLogger(__name__)


@dataclass
class InstantiationResult:
    created: int = 0
    skipped: int = 0
    max_reached: int = 0


async def instantiate_recurring_tasks(
    user_id, target_date: date, db: AsyncSession
) -> InstantiationResult:
    """
    I26: Uses begin_nested() (SAVEPOINT) for duplicate handling.
    D46: Increment-first reservation pattern.
    """
    iso_weekday = target_date.weekday()  # 0=Mon, 6=Sun
    rules = await _get_active_rules(user_id, iso_weekday, db)

    result = InstantiationResult()

    for rule in rules:
        # D46: Check max_instances before creating
        if rule.max_instances is not None and rule.instances_created >= rule.max_instances:
            result.max_reached += 1
            logger.info("recurring_task_max_reached", extra={
                "rule_id": str(rule.id), "instances": rule.instances_created,
            })
            continue

        # D46: Increment-first reservation
        stmt = (
            update(RecurringTaskRule)
            .where(RecurringTaskRule.id == rule.id)
            .values(instances_created=RecurringTaskRule.instances_created + 1)
        )
        await db.execute(stmt)

        # I26: SAVEPOINT — inner failure does NOT roll back outer transaction
        try:
            async with db.begin_nested():  # SAVEPOINT
                new_task = Task(
                    user_id=user_id,
                    goal_id=rule.goal_id,
                    title=rule.title,
                    task_type=rule.task_type,
                    duration_mins=rule.duration_mins,
                    priority=rule.priority,
                    scheduled_start=rule.scheduled_start,
                    source_rule_id=rule.id,
                    source_date=target_date,
                    sequence_order=0,
                    task_status="active",
                )
                db.add(new_task)
                # flush happens at SAVEPOINT release

            result.created += 1
            logger.info("recurring_task_instantiated", extra={
                "rule_id": str(rule.id), "task_title": rule.title,
                "target_date": target_date.isoformat(),
            })

        except IntegrityError:
            # Duplicate blocked by uq_task_per_rule_per_date — SAVEPOINT rolled back
            # Outer transaction preserved — all prior tasks survive
            result.skipped += 1

            # Decrement reservation on duplicate
            stmt = (
                update(RecurringTaskRule)
                .where(RecurringTaskRule.id == rule.id)
                .values(instances_created=RecurringTaskRule.instances_created - 1)
            )
            await db.execute(stmt)

            logger.info("recurring_task_duplicate_blocked", extra={
                "rule_id": str(rule.id), "target_date": target_date.isoformat(),
            })

    return result


async def _get_active_rules(user_id, iso_weekday: int, db: AsyncSession):
    result = await db.execute(
        select(RecurringTaskRule).where(
            RecurringTaskRule.user_id == user_id,
            RecurringTaskRule.is_active.is_(True),
            RecurringTaskRule.days_of_week.any(iso_weekday),
        )
    )
    return result.scalars().all()
```

> **C3 Resolution:** The original plan used `db.rollback()` which rolls back the entire `get_db()` session, silently discarding all tasks created before the duplicate. `begin_nested()` creates a PostgreSQL `SAVEPOINT` — only the inner insert is rolled back on `IntegrityError`. All prior work survives.

---

## 10. Rescue Mission Launcher — Constraint-Name Dedup (M1 Fix)

```python
# app/services/rescue_service.py (relevant excerpt)

async def create_rescue_notification(user_id, task, db: AsyncSession):
    """
    I31: Rescue dedup uses constraint name, not column+where reconstruction.
    D43: Only goal-linked tasks qualify.
    """
    body = encrypt_field_versioned(
        f"You've been struggling with '{task.title}'. "
        f"Here's a lighter approach to get back on track."
    )

    stmt = pg_insert(Notification).values(
        user_id=user_id,
        type='rescue_mission',
        title=f"Rescue: {task.title[:50]}",
        body_ciphertext=body,                    # D45: TEXT column
        rescue_task_id=task.id,
        fire_at=datetime.now(timezone.utc),
        schedule_date=date.today(),
    ).on_conflict_do_nothing(
        constraint='uq_notification_rescue_pending'  # I31: by name
    )
    result = await db.execute(stmt)

    if result.rowcount == 1:
        logger.info("rescue_notification_created", extra={
            "user_id": str(user_id), "task_id": str(task.id),
        })
    else:
        logger.info("rescue_notification_deduped_by_db", extra={
            "task_id": str(task.id),
        })
```

---

## 11. Encryption Read Path — C4 Fix

```python
# app/services/encryption_helpers.py — UPDATED

def get_evening_note(daily_log) -> Optional[str]:
    """
    I30: Returns None on ALL failure modes (not "[encrypted]").
    D33: Aligned with Sprint 6 v17 decision.
    Debuggability via Prometheus counter + structured error log.
    """
    if daily_log.evening_note_encrypted is True:
        if daily_log.evening_note_ciphertext is None:
            logger.error("daily_log_encrypted_but_null_ciphertext", extra={
                "daily_log_id": str(daily_log.id),
            })
            return None

        try:
            ct = daily_log.evening_note_ciphertext
            if isinstance(ct, (memoryview, bytes)):
                ct = bytes(ct).decode('utf-8') if isinstance(ct, memoryview) else ct.decode('utf-8')
            return decrypt_field_versioned(ct)
        except Exception:
            logger.error("daily_log_decrypt_failed", extra={
                "daily_log_id": str(daily_log.id),
            })
            if daily_log_decrypt_failures is not None:
                daily_log_decrypt_failures.inc()
            return None  # I30: was "[encrypted]", now None

    return daily_log.evening_note
```

> **C4 Resolution:** `"[encrypted]"` leaked to mobile/web clients as visible text. `None` maintains the API contract (nullable `evening_note`). The Prometheus counter `daily_log_decrypt_failures` + structured error log preserve full debuggability.

---

## 12. Notification Cleanup — SKIP LOCKED (M2 Fix)

```python
# app/services/notification_service.py — cleanup

async def cleanup_old_notifications(db: AsyncSession):
    """
    I32: Uses SKIP LOCKED to avoid blocking concurrent user reads.
    Consistent with Sprint 6 D34 retention pattern.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)

    # Select dismissed notifications older than cutoff
    subq = (
        select(Notification.id)
        .where(
            Notification.dismissed_at.isnot(None),
            Notification.dismissed_at < cutoff,
        )
        .order_by(Notification.id)  # deterministic for SKIP LOCKED
        .limit(1000)
        .with_for_update(skip_locked=True)
    )
    rows = await db.execute(subq)
    ids = [r[0] for r in rows.all()]

    if ids:
        await db.execute(
            delete(Notification).where(Notification.id.in_(ids))
        )
        logger.info("notifications_cleaned", extra={"count": len(ids)})
```

---

## 13. Constants — DEFAULT_TIMEZONE (M3 Fix)

```python
# app/core/constants.py — ADDITION

# D50: Centralized timezone fallback.
# Matches User model default at user.py#L40.
# Used in all getattr(user, "timezone", ...) fallbacks.
DEFAULT_TIMEZONE = "Asia/Kolkata"
```

Usage pattern (7 locations in `insights_service.py` and `checkin_service.py`):
```python
from app.core.constants import DEFAULT_TIMEZONE

# Before: getattr(user, "timezone", "Asia/Kolkata")
# After:
get_user_today(getattr(user, "timezone", DEFAULT_TIMEZONE))
```

---

## 14. Document Map

| Part | File | Contents |
|------|------|----------|
| 1 | `sprint7_hardened_part1.md` | Invariants (I26–I34), Decisions (D41–D50), Schema (Migrations 006–010), Notification service, Recurring task SAVEPOINT, Rescue dedup, Encryption C4 fix, Cleanup SKIP LOCKED, Constants |
| 2 | `sprint7_hardened_part2.md` | Milestone service, Rescue launcher full, Notification API (GET/ACK), Pydantic schemas, Heatmap (no-cache), Trajectory bonus |
| 3 | `sprint7_hardened_part3.md` | Test targets (all features), Deployment order, Rollback matrix, Observability, Pre-execution checklist, Regression guards |
