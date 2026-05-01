# Sprint 7 Architect Review: Hardened Baseline

## Verdict

**Approved as an architectural baseline, but still no-go for staging until the P0 checklist is cleared.** The original review findings are confirmed against the Sprint 7 plan and the Momentum API source shape. The submitted plan has real runtime blockers: recurring tasks do not enter the solver, rescue dedupe is defeated by nullable keys, PostgreSQL partial-index upsert syntax is wrong, router dependencies drift from repo conventions, and heatmap cache responses can be poisoned across query sizes.

This v2 review adds three further hardening items from the meta-review: transaction rollback boundaries in recurring instantiation, notification retention batching, and per-goal progress correctness for rescue and milestones.

## Confirmed Critical Findings

### 1. [P0] Recurring Tasks Never Enter The Solver

The plan creates `Task` ORM rows before schedule solving, but the current scheduler builds `GoalTaskGroup` inputs from goal metadata and generated `TaskRequirement`s. It does not read pre-created recurring `Task` rows as solver inputs.

Result: recurring tasks can persist but remain unscheduled, invisible to the daily plan, or disconnected from solver ordering and capacity constraints.

Required correction: recurring rules must be converted into solver `TaskRequirement`s before `ConstraintSolver.solve(...)`. The solver output must carry recurrence metadata forward so `_save_schedule(...)` persists `recurring_rule_id` and `source_date` on final scheduled or deferred `Task` rows.

### 2. [P0] Rescue Dedup Is Ineffective Because `rescue_task_id` Is Nullable

The proposed pending rescue unique index is keyed on `rescue_task_id`, but `launch_rescue_mission(...)` inserts rescue notifications with `rescue_task_id=None`. PostgreSQL unique indexes allow multiple `NULL` values, so the dedupe safety net does not protect the planned write path.

Result: repeated rescue launches can create duplicate pending rescue notifications despite the design claiming DB-level protection.

Required correction: rescue needs goal-level persistence. For v1, add `notifications.goal_id` and dedupe pending rescue notifications on `(user_id, goal_id)` where `type='rescue_mission' AND dismissed_at IS NULL AND delivered_at IS NULL`. A separate `rescue_missions` table is cleaner long-term, but `notifications.goal_id` is the smaller Sprint 7 fix.

### 3. [P0] Partial Unique Index Is Incorrectly Targeted With `ON CONSTRAINT`

The migration creates `uq_notification_task_reminder` as a partial unique index, not a table-level unique constraint. The service then calls `on_conflict_do_update(constraint='uq_notification_task_reminder')`, which PostgreSQL will reject because `ON CONFLICT ON CONSTRAINT` targets named constraints, not arbitrary partial indexes.

Result: task reminder upserts can fail at runtime once this path is exercised.

Required correction: use PostgreSQL-compatible partial-index upsert syntax with `index_elements=[...]` and `index_where=...`, matching the partial unique index predicate. Do not use `constraint=` for partial indexes created by `op.create_index(...)`.

### 4. [P0] Router Auth Dependencies Are Imported From The Wrong Module

The proposed routers import `get_current_user` from `app.routers.auth`, but this repo defines auth dependencies in `app.core.dependencies`. Existing feature routers use `CurrentUserComplete` and `DB` aliases.

Result: new router modules can fail to import, bypass onboarding-complete protection, or diverge from established auth behavior.

Required correction: use `from app.core.dependencies import CurrentUserComplete, DB`; endpoint signatures should use `current_user: CurrentUserComplete` and `db: DB`. Router registration must preserve the existing `/api/v1` prefix style in `app/main.py`.

### 5. [P1] Heatmap Cache Key Omits `days`

The proposed in-memory heatmap cache is keyed only by `user_id`, but the endpoint accepts a `days` query parameter. A request for `days=30` can poison a later `days=90` read.

Result: users can receive structurally valid but semantically wrong heatmap responses.

Required correction: key cache entries by `(user_id, days)`, route the existing `/api/v1/insights/heatmap` endpoint through the cached wrapper, and invalidate every heatmap variant for a user after daily-log-changing writes.

### 6. [P0] `db.rollback()` Breaks Caller Transaction Boundaries

The recurring instantiation plan catches `IntegrityError` and calls `await db.rollback()` inside `instantiate_tasks_for_date(...)`. That rolls back the entire session transaction, not only the failed insert. In the schedule-generation path, this can erase the reservation counter increment and unrelated pending caller work.

Result: the D10 reservation pattern is defeated, and schedule generation can be corrupted by a duplicate recurring-task insert.

Required correction: isolate duplicate insert handling with `async with db.begin_nested():` so only the failed insert rolls back. The outer transaction, reservation counter, and caller state must survive. If using a conditional reservation update instead, duplicate task creation should still be contained by a SAVEPOINT or an upsert that does not abort the outer transaction.

### 7. [P1] Notification Retention Cleanup Lacks Batching And `SKIP LOCKED`

The planned retention cleanup uses one broad `DELETE WHERE created_at < cutoff`. On a table with real notification volume, that can take heavy locks, generate large WAL spikes, and risk statement timeouts.

Result: cleanup can compete with user-facing notification reads/writes and become operationally unsafe.

Required correction: adopt a bounded batch cleanup pattern using `FOR UPDATE SKIP LOCKED` over small batches, for example 1000 rows per loop. Run it from a maintenance job or explicit admin/cron path, with logging per batch and total deleted count.

### 8. [P1] Milestone And Rescue Progress Are User-Wide Instead Of Per-Goal

The proposed rescue candidate logic reads `DailyLog` by `user_id`, and the milestone integration uses schedule-wide completion for the primary goal. This does not match the repo's multi-goal architecture.

Result: a user doing well on one goal can mask a failing goal, and a user doing poorly on one goal can trigger rescue or milestone behavior for the wrong goal.

Required correction: compute progress from goal-scoped task data. Prefer `Task` and `TaskLog` joined by `Task.goal_id` for Sprint 7. Add `goal_id` to `DailyLog` only if the broader architecture is intentionally moving daily logs from user-day to goal-day, which would be a larger migration.

## Hardened Implementation Blueprint

### Recurring Tasks

Do not pre-create scheduled `Task` rows as the recurrence mechanism. Treat recurring rules as schedule input, not schedule output.

Corrected flow:

1. Load active recurring rules for the user and target date.
2. Reserve each due rule/date atomically with row-level locking or a conditional update.
3. Convert each reserved rule into a `TaskRequirement` carrying `recurring_rule_id` and `source_date` metadata.
4. Merge those requirements into the relevant `GoalTaskGroup` before solving.
5. Let the solver schedule or defer them like any other requirement.
6. Persist recurrence metadata on the resulting `Task` rows in `_save_schedule(...)`.
7. Handle duplicate insert conflicts inside a SAVEPOINT, never with a full session rollback.

### Rescue Missions

Rescue is goal-level, so the data model must say that directly. `rescue_task_id` is useful only after a concrete rescue task exists; it is not a valid launch dedupe key.

Sprint 7 v1 should add `goal_id` to `notifications`, create a pending rescue unique partial index on `(user_id, goal_id)`, and write rescue notifications with `goal_id=goal.id`. Rescue must also be called from a real trigger path such as evening review, schedule generation, or scheduled maintenance.

### Notifications

Define poll semantics before implementation. Recommended v1 contract:

- `GET /notifications` returns due, not dismissed notifications by default.
- Future scheduled rows are excluded unless a future/history flag is explicitly added.
- ACK is retry-safe: repeated ACK for the same state is treated as success or a documented no-op, not a surprising client failure.
- Task reminder upsert uses `index_elements` and `index_where` for the partial unique index.
- Retention cleanup is batched with `SKIP LOCKED`, not a single broad delete.

### API Wiring

Routers must match the existing app conventions:

- Dependencies from `app.core.dependencies`.
- Onboarding-complete protection via `CurrentUserComplete`.
- Database sessions via `DB`.
- Router registration through `app.include_router(..., prefix="/api/v1")`.
- No manual `db.commit()` inside routers unless the repo intentionally changes its request transaction pattern, because `get_db()` already commits after successful requests.

### Heatmap Cache

The in-memory cache is acceptable only as a best-effort, single-process optimization.

Correct cache key: `(user_id, days)`.

Correct invalidation: remove every cache entry for the user after evening review, morning check-in, real-time task completion if it changes `DailyLog`, task-status writes that affect log-derived output, and any backfill touching `daily_logs`.

### Milestones And Multi-Goal Correctness

Milestone completion and rescue pacing must be based on per-goal progress. For Sprint 7, compute per-goal completion using `Task.goal_id` plus `TaskLog` status over the target date/window. If that calculation is not ready, milestone automation should be explicitly scoped down rather than pretending it is multi-goal correct.

## Required Before Implementation

| Priority | Action | Timing |
| --- | --- | --- |
| P0 | Replace direct recurring `Task` creation with `TaskRequirement` solver injection. | Pre-staging |
| P0 | Carry `recurring_rule_id` and `source_date` through solver output and `_save_schedule(...)`. | Pre-staging |
| P0 | Add `notifications.goal_id` and pending rescue dedupe on `(user_id, goal_id)`. | Pre-staging |
| P0 | Replace partial-index `constraint=` upsert with `index_elements` plus `index_where`. | Pre-staging |
| P0 | Replace inner `db.rollback()` in recurring conflict handling with SAVEPOINT isolation. | Pre-staging |
| P1 | Align new routers to `CurrentUserComplete` and `DB` from `app.core.dependencies`. | Pre-staging |
| P1 | Key heatmap cache by `(user_id, days)` and invalidate all user variants. | Pre-staging |
| P1 | Batch notification retention cleanup with `FOR UPDATE SKIP LOCKED`. | Pre-prod |
| P1 | Scope milestone and rescue progress to per-goal task completion. | Pre-prod |
| P2 | Add idempotent `backfill_milestones.py` with a `NOT EXISTS` guard. | Pre-deploy |
| P2 | Expand tests for solver integration, SAVEPOINT behavior, and partial-index upserts. | Pre-prod |

## Test And Validation Coverage

The original 72-test matrix is broad, but it must be extended to cover the actual failure modes.

### Startup And Router Wiring

- Import every new router module successfully.
- Start the FastAPI app with all routers registered.
- Assert new endpoints are mounted under `/api/v1`, not unversioned paths.
- Assert onboarding-incomplete users cannot access endpoints protected by `CurrentUserComplete`.

### Migrations

- Alembic upgrade from `f011b_dead_letters` through all Sprint 7 migrations.
- Alembic downgrade back to `f011b_dead_letters` in a disposable database.
- Verify partial indexes and predicates match service upsert targets.
- Verify `notifications.goal_id`, `tasks.source_date`, `tasks.recurring_rule_id`, `goals.trajectory_bonus`, and `goals.last_rescue_at` match model metadata.

### Notifications

- Task reminder upsert works against the partial unique index.
- Re-scheduling a task updates the existing reminder instead of inserting duplicates.
- Rescue pending dedupe blocks repeated launches for the same goal.
- Future `fire_at` notifications do not appear in due-only polling if that contract is chosen.
- Repeated ACK requests are safe for client retries.
- Retention cleanup deletes old notifications in bounded batches and does not block active rows.

### Recurring Tasks

- A due recurring rule appears in the solver input.
- A due recurring rule appears in the final schedule response with recurrence metadata persisted.
- A non-matching weekday rule is ignored.
- Duplicate schedule generation for the same date does not duplicate recurring tasks.
- Concurrent schedule generation does not exceed `max_per_day`.
- An unscheduled recurring requirement is persisted consistently as deferred with recurrence metadata.
- Duplicate insert conflict rolls back only the SAVEPOINT, not the caller transaction.

### Rescue Missions

- Repeated launches for the same goal produce at most one pending rescue.
- Daily rescue cap is enforced across goals.
- Per-goal cooldown is enforced.
- Candidate evaluation uses goal-specific progress, not user-wide average completion.
- Rescue launch path is exercised through the actual trigger, not only direct unit calls.

### Heatmap Cache

- `days=30` and `days=90` have independent cache entries.
- Cache hit returns the correct size and date range.
- Evening review invalidates all heatmap variants for the user.
- Morning check-in and task completion invalidation are covered if those writes affect heatmap output.

### Milestones

- Milestones are seeded for new goals.
- Backfill seeds existing goals idempotently.
- Multi-goal users do not complete milestones for the wrong goal.
- Completion and auto-skip rules use the chosen goal-scoped progress model.

## Final Recommendation

Revision can proceed from this hardened baseline. Staging must remain blocked until all P0 items are corrected and proven with tests. Production must remain blocked until the P1 items are implemented or deliberately deferred with clear product scope reductions.

Implement in vertical slices:

1. Notifications with correct upsert, goal-scoped rescue dedupe, router wiring, and batched retention.
2. Recurring rules integrated into solver input/output with transaction-safe reservation.
3. Milestones with explicit per-goal progress semantics.
4. Rescue missions with goal-specific candidate evaluation and a real trigger.
5. Heatmap cache as a small final optimization.

This keeps Sprint 7 aligned with PostgreSQL semantics, transaction safety, and Momentum's multi-goal architecture.
