# Sprint 7 — Execution Tracker

## Slice 1 — Schema Foundation
- [ ] Migration f012: Notification hardening (goal_id, indexes, rescue dedup)
- [ ] Migration f013: recurring_task_rules table + days_of_week trigger
- [ ] Migration f014: tasks.recurring_rule_id + source_date + dedup index
- [x] RecurringTaskRule model in goal.py
- [x] Task model: recurring_rule_id + source_date columns
- [x] Notification model: goal_id column
- [x] TaskRequirement dataclass: recurring fields
- [x] ScheduledTask dataclass: recurring fields

## Slice 2 — Notifications & Parse Time
- [ ] Hardened _parse_time() (§7)
- [ ] DST-safe timezone wiring with fold=0 (§7b, P1#5 fix)

## Slice 3 — Recurring Rules → Solver
- [ ] recurring_task_service.py with bulk NOT EXISTS (P0#1 fix)
- [ ] Solver integration in _generate_schedule_internal (§11)
- [ ] SAVEPOINT dedup in _save_schedule with safe_expunge (P0#1, P1#4 fix)
- [ ] Carry recurring metadata on scheduled + deferred tasks (§4)

## Slice 4 — Rescue Missions & Config
- [ ] rescue_threshold_pct in config.py (D59)
- [ ] Per-goal rescue candidate eval (§9b) with FILTER aggregate (P1#3)
- [ ] max_per_day > 1 service validation (§9c)
- [ ] Pydantic validators for days_of_week (I47)
- [ ] Prometheus metrics with low cardinality (P2#7)

## Slice 5 — Milestones
- [ ] _compute_current_value with FILTER aggregate (P1#3)

## Slice 6 — Maintenance & Documentation
- [ ] REINDEX CONCURRENTLY maintenance script (P0#2)
- [ ] Index bloat monitoring query
- [ ] body_ciphertext Text convention comment (D58)
- [ ] Fernet key rotation support for notifications (P2#8)

## Cross-Cutting
- [ ] safe_expunge() utility (P1#4)
- [ ] Recurring rules router + registration in main.py
- [ ] Recurring rules Pydantic schemas
