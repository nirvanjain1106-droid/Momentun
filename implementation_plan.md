# Sprint 7 — Execution Plan

> Translates the finalized architectural plan (db47afac) into actionable implementation steps.
> All P0/P1/P2 findings resolved. 46 checklist items to implement.

---

## Source of Truth

The full architectural spec lives in:
[implementation_plan.md](file:///C:/Users/nirva/.gemini/antigravity/brain/db47afac-a5fa-4282-b9b7-f9f65777f940/implementation_plan.md)

This document is the **execution order** — what to do, in what sequence, and where.

---

## Execution Strategy

We follow the **Vertical-Slice Implementation Order** (§14 of the architectural plan).
Each slice is self-contained and testable before proceeding to the next.

---

## Slice 0 — Baseline Verification

- Verify Alembic is at `f011b_dead_letters`
- Verify all existing tests pass

---

## Slice 1 — Schema Foundation (Checklist #1-3, #4, #29, #44, #45, #39)

### 1a. Migration 006 Patch — Notifications

**File:** `alembic/versions/f012_notification_hardening.py` [NEW]

Add to `notifications` table:
- `goal_id UUID REFERENCES goals(id) ON DELETE CASCADE`
- `CREATE INDEX ix_notifications_goal_id ON notifications (goal_id) WHERE goal_id IS NOT NULL`
- `CREATE INDEX ix_notification_reminder_task ON notifications (reminder_task_id) WHERE reminder_task_id IS NOT NULL`
- `CREATE UNIQUE INDEX uq_notification_rescue_pending ON notifications (user_id, goal_id) WHERE type = 'rescue_mission' AND dismissed_at IS NULL AND delivered_at IS NULL`

### 1b. Migration 007 — Recurring Task Rules

**File:** `alembic/versions/f013_recurring_task_rules.py` [NEW]

Full `recurring_task_rules` table creation with:
- `max_per_day INTEGER NOT NULL DEFAULT 1` (D55)
- `days_of_week INTEGER[] NOT NULL` with I44 weekday semantics
- `scheduled_start VARCHAR(5)` with tightened regex CHECK `^([01]\d|2[0-3]):[0-5]\d$`
- `days_of_week <@ ARRAY[0,1,2,3,4,5,6]` CHECK constraint (I47)
- Indexes: `ix_recurring_task_rules_user_id`, `ix_recurring_task_rules_goal_id`, `ix_recurring_task_rules_active`

### 1c. Migration 007b — Task Columns

**File:** `alembic/versions/f014_task_recurring_columns.py` [NEW]

- `ALTER TABLE tasks ADD COLUMN recurring_rule_id UUID REFERENCES recurring_task_rules(id) ON DELETE SET NULL`
- `ALTER TABLE tasks ADD COLUMN source_date DATE`
- `CREATE UNIQUE INDEX uq_task_per_rule_per_date ON tasks (recurring_rule_id, source_date) WHERE recurring_rule_id IS NOT NULL AND deleted_at IS NULL`
- `CREATE INDEX ix_tasks_recurring_rule_id ON tasks (recurring_rule_id) WHERE recurring_rule_id IS NOT NULL`

### 1d. Model Updates

**File:** [goal.py](file:///c:/Users/nirva/Downloads/Momentum%20API/app/models/goal.py) [MODIFY]

- Add `RecurringTaskRule` model class
- Add `recurring_rule_id` and `source_date` columns to `Task` model
- Add `goal_id` column to `Notification` model (if not already present)

### 1e. Dataclass Updates

**File:** [constraint_solver.py](file:///c:/Users/nirva/Downloads/Momentum%20API/app/services/constraint_solver.py) [MODIFY]

- Add `recurring_rule_id: Optional[str] = None` and `source_date: Optional[date] = None` to `TaskRequirement`
- Add `recurring_rule_id: Optional[str] = None` and `source_date: Optional[date] = None` to `ScheduledTask`

### 1f. Backward Compatibility (#39)

Verify: old app code tolerates NULL `recurring_rule_id`, `source_date` — both are nullable, so existing code paths that don't reference them will work unchanged.

---

## Slice 2 — Notifications Hardening (Checklist #5, #10, #13, #30, #33, #42)

### 2a. Hardened `_parse_time()`

**File:** [schedule_service.py](file:///c:/Users/nirva/Downloads/Momentum%20API/app/services/schedule_service.py) [MODIFY]

Add the hardened `_parse_time()` function per §7 of the architectural plan.

### 2b. Timezone-Safe Reminder Wiring (I46)

**File:** New or existing notification/reminder service [MODIFY]

Wire `_parse_time()` callers with `ZoneInfo` localization + `fold=0` for DST safety per §7b.

### 2c. Router Import Standardization (#10)

Verify all new routers use `app.core.dependencies` imports.

---

## Slice 3 — Recurring Rules → Solver (Checklist #6-9, #17, #19, #20, #34)

### 3a. Recurring Task Service

**File:** `app/services/recurring_task_service.py` [NEW]

Implement `get_recurring_requirements()` per §6 — converts active rules to `TaskRequirement` with pre-check dedup.

### 3b. Solver Integration

**File:** [schedule_service.py](file:///c:/Users/nirva/Downloads/Momentum%20API/app/services/schedule_service.py) [MODIFY]

Wire `get_recurring_requirements()` into `_generate_schedule_internal()` after building `goal_task_groups` per §11.

### 3c. SAVEPOINT Dedup in `_save_schedule`

**File:** [schedule_service.py](file:///c:/Users/nirva/Downloads/Momentum%20API/app/services/schedule_service.py) [MODIFY]

Add SAVEPOINT + `ON CONFLICT DO NOTHING` for recurring task inserts per §6.
Add `db.expunge(task)` after SAVEPOINT rollback (I45) with defensive comment.

### 3d. Carry Recurring Metadata

Both scheduled AND deferred tasks must carry `recurring_rule_id` + `source_date` per §4.

---

## Slice 4 — Rescue Missions (Checklist #12, #21, #28, #40, #41, #43)

### 4a. Goal ID NULL Guard (#12)

**File:** notification service [MODIFY]

Add `if not goal or not goal.id: raise ValueError(...)` before rescue insert per §9.

### 4b. Per-Goal Rescue Evaluation (#21)

Replace user-wide `DailyLog` aggregation with goal-scoped `Task` completion query per §9b.

### 4c. Config Externalization (#43)

**File:** [config.py](file:///c:/Users/nirva/Downloads/Momentum%20API/app/config.py) [MODIFY]

Add `rescue_threshold_pct: float = 30.0` to Settings (D59).

### 4d. Pydantic Validators (#40)

**File:** Recurring rule schemas [NEW/MODIFY]

Add `days_of_week` validators: range 0-6, unique, ISO↔Python conversion (I47).

### 4e. Service Validation (#28)

Reject `max_per_day > 1` at service layer per §9c.

### 4f. Prometheus Metrics (#41)

Add `recurring_dedup_precheck_hit` and `recurring_dedup_index_blocked` counters.

---

## Slice 5 — Milestones (Checklist #11, #16, #38)

### 5a. Cumulative Progress (#11, #16)

Implement `_compute_current_value()` per §5 — index-friendly OR logic, no COALESCE.

### 5b. SeqScan Runbook (#38)

Add runbook docstring note per §5 RUNBOOK section.

---

## Slice 6 — Documentation & Cross-Cutting (Checklist #22-24, #26, #36, #46)

- D52: UTC midnight rate-limit trade-off documentation
- D57: Solver deferral = consumes daily slot documentation
- D58: `body_ciphertext` Text vs LargeBinary convention (§9d)
- Alembic CI/CD contract (D53)
- `scheduled_start` as v2 placeholder documentation

---

## Verification Plan

### Automated Tests (T1–T24)

All 24 test targets from §15 of the architectural plan. Key gates:

| Gate | Tests | Blocks |
|------|-------|--------|
| Fast-Fail (Slice 0.5) | T4-T7, T14, T22 | Slice 1 |
| Schema (Slice 1) | Migration up/down | Slice 2 |
| Concurrency (Slice 3) | T16 (independent sessions, identity_map assertions) | Slice 4 |
| DST (Slice 2) | T20, T21 | Production |

### Manual Verification

- `alembic upgrade head` on clean + existing DB
- `EXPLAIN ANALYZE` on milestone query to verify no SeqScan

---

## Open Questions

> [!IMPORTANT]
> **Ready to execute.** No open questions remain — all were resolved in the architectural plan.
> Please confirm you'd like me to begin execution starting with Slice 1 (Schema Foundation).
