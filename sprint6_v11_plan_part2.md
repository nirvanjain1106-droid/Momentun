# Sprint 6 — Rev 11 — Part 2: Tests, Deployment, Observability

> Continuation of [Part 1](file:///c:/Users/nirva/Downloads/Momentum%20API/sprint6_v11_plan_part1.md)

---

## Test Plan — 261 Targets (was 240 in Rev 10)

### Feature 1 — Notifications (24 tests) `[V11: was 17]`

| # | Test | Assertion |
|---|------|-----------|
| 1.1–1.17 | Unchanged from Rev 10 | |
| **1.18** | **`test_notification_generation_23h30_task`** | `scheduled_start='23:30'` → valid UTC fire_at, no `ValueError: hour must be in 0..23` |
| **1.19** | **`test_dst_spring_forward_correct_utc`** | Task at 02:30 on spring-forward day → `_safe_localize` returns correct UTC (not 1h off). Round-trip check logs DST gap. |
| **1.20** | **`test_dst_fall_back_deterministic`** | Ambiguous local time (01:30 fall-back) → deterministic fold=0 selection. UTC is consistent. |
| **1.21** | **`test_api_get_returns_decrypted_body`** | Create notification with encrypted body → GET `/notifications` → JSON `body` is plaintext, not ciphertext. |
| **1.22** | **`test_api_ack_idempotent_timestamp_unchanged`** | Double-ack → `delivered_at` value is NOT updated to a newer timestamp on second call. |
| **1.23** | **`test_upsert_where_clause_sql_compilation`** | Log compiled SQL. Assert `ON CONFLICT ... DO UPDATE ... WHERE dismissed_at IS NULL AND delivered_at IS NULL`. |
| **1.24** | **`test_notification_retention_cleanup`** | Insert old dismissed + old undismissed + recent. Cleanup deletes only old+dismissed. |

### Feature 4 — Rescue Mission (11 tests) `[V11: was 10]`

| # | Test | Assertion |
|---|------|-----------|
| 4.1–4.10 | Unchanged from Rev 10 | |
| **4.11** | **`test_rescue_launcher_concurrent_dedup`** | `asyncio.gather` with 2 concurrent rescue launchers for same task → exactly 1 succeeds, 1 gets `IntegrityError` (caught). |

### Feature 5 — Encryption (25 tests) `[V11: was 16]`

| # | Test | Assertion |
|---|------|-----------|
| 5.1–5.16 | Unchanged from Rev 10 | |
| **5.17** | **`test_write_path_uses_versioned_encryption`** | `save_evening_note` → ciphertext starts with `v0:`. Asserts D14 wired. |
| **5.18** | **`test_decrypt_versioned_with_key_rotation`** | Encrypt with key 1, decrypt with key 1 → succeeds. Encrypt with key 1, try decrypt routing to key 0 → `InvalidToken`. |
| **5.19** | **`test_reverse_migration_occ_prevents_overwrite`** | Concurrent user update during reverse migration → `rowcount==0`, user data preserved. |
| **5.20** | **`test_reverse_migration_handles_versioned_ciphertext`** | Ciphertext with `v0:...` prefix → decrypts correctly in reverse migration. |
| **5.21** | **`test_migration_asserts_encryption_active`** | Run migration with `ENCRYPTION_ACTIVE=False` → `AssertionError` raised, nothing processed. |
| **5.22** | **`test_migration_uses_created_at_cursor`** | Inject rows with UUIDv4 ids that are lexicographically out of order. Assert all rows processed (no skips). |
| **5.23** | **`test_migration_dead_letter_logging`** | Inject row that causes encryption error → ID appears in `dead_letter_ids` log. Verification query catches it. |
| **5.24** | **`test_key_version_out_of_bounds`** | `ACTIVE_KEY_VERSION=99` with 1 key → startup `ValueError` from validator. |
| **5.25** | **`test_reencrypt_job_version_upgrade`** | Encrypt with v0, run reencrypt(target=1) → ciphertext now starts with `v1:`. Decrypt succeeds. |

### Infrastructure Tests `[V11-NEW]`

| # | Test | Assertion |
|---|------|-----------|
| **I.1** | **`test_alembic_concurrently_no_transaction_error`** | Migration 007b runs without `cannot run inside a transaction block`. |
| **I.2** | **`test_metric_encrypt_duration_emitted`** | Call `encrypt_field_versioned` → histogram observation exists in registry. |
| **I.3** | **`test_metric_upsert_conflict_emitted`** | Generate duplicate notification → counter incremented with correct labels. |
| **I.4** | **`test_metric_migration_remaining_gauge`** | Run migration batch → gauge decrements. |
| **I.5** | **`test_cron_maintenance_mode_skips`** | Set `CRON_MAINTENANCE_MODE=true` → notification cron logs skip and returns without processing. |
| **I.6** | **`test_key_version_distribution_metric`** | After migration, gauge shows correct count per version. |

### Concurrency Tests (Rev 10 C.1–C.5 + V11)

| # | Test | Assertion |
|---|------|-----------|
| C.1–C.5 | Unchanged from Rev 10 | |

### Total: 240 (Rev 10) + **21 new** = **261 targets**

---

## Deployment Order `[V11-FIX]`

```
 1.  Pre-condition tests pass
 2.  Migration 006 — Notification table + inline indexes (new table, no CONCURRENTLY needed)
 3.  Migration 007 — Recurring task rules table
 4.  Migration 007b — Task columns + CONCURRENT indexes (autocommit, separate file)
 5.  Migration 008 — Milestones table
 6.  Migration 009 — Heatmap CONCURRENT index (autocommit, separate file)
 7.  Migration 010 — Trajectory bonus columns on Goal
 8.  Set CRON_MAINTENANCE_MODE=true                            ← V11-NEW: pause crons
 9.  Deploy feature code (Features 1-4, 6) + encryption write path (ENCRYPTION_ACTIVE=false)
10.  Migration 011 — DailyLog encryption columns
11.  Deploy encryption-aware read path (aliased decrypt_field = decrypt_field_versioned)
12.  Automated gate: kubectl rollout status --timeout=300s     ← V11-FIX: automated, not manual
     + verify CODE_VERSION via /health endpoint
13.  Set ENCRYPTION_ACTIVE=true
14.  Set CRON_MAINTENANCE_MODE=false                           ← V11-NEW: resume crons
15.  Run scripts/encrypt_data.py (asserts ENCRYPTION_ACTIVE=true)
16.  Verify (THREE queries):                                   ← V11: added dead-letter check
       a) SELECT count(*) FROM daily_logs
            WHERE evening_note IS NOT NULL AND evening_note_encrypted = true;  → 0
       b) SELECT count(*) FROM daily_logs
            WHERE evening_note IS NOT NULL AND evening_note_encrypted = false; → 0
       c) Check dead_letter_ids log — manual retry any failures
```

> [!IMPORTANT]
> **V11 deployment changes:**
> 1. **Step 8/14:** Cron pause/resume brackets the encryption rollout (D19)
> 2. **Step 12:** Automated via `kubectl rollout status`, not manual verification. Health endpoint reports `CODE_VERSION` for D17 validation.
> 3. **Step 16c:** Dead-letter check added for rows that failed encryption
> 4. **Migrations 007b/009:** Explicitly in separate autocommit files (Alembic CONCURRENTLY fix)

### Rollback Procedures `[V11-FIX]`

| Step | Rollback | Notes |
|------|----------|-------|
| Step 9 (code) | Revert Docker image. Migrations 006-010 are additive. | Old code ignores new tables/columns. |
| Step 13 (flag) | Set `ENCRYPTION_ACTIVE=false`. | New writes go plaintext. Existing ciphertext readable (aliased decrypt). |
| Step 15 (migration) | Run `scripts/decrypt_data.py`. | V11: uses `decrypt_field_versioned` + OCC guard. Assert flag=false first. |
| Migration 012 | **DO NOT RUN** until N+1 release. | Irreversible column drop. |

---

## Observability `[V11-FIX: ALL INSTRUMENTED]`

### Metrics (with code locations)

| Metric | Type | Instrumented In |
|--------|------|-----------------|
| `encrypt_field_duration_seconds` | Histogram | `encrypt_field_versioned()` — wrap Fernet call |
| `decrypt_field_duration_seconds` | Histogram | `decrypt_field_versioned()` — wrap Fernet call |
| `notification_upsert_conflict_total` | Counter(type, result) | `generate_daily_notifications()` §1.3 |
| `notification_timezone_error_total` | Counter | `generate_daily_notifications()` §1.3 |
| `encryption_migration_remaining_rows` | Gauge | `migrate_evening_notes()` §5.4 |
| `encryption_migration_errors_total` | Counter | `migrate_evening_notes()` §5.4 |
| `encryption_key_version_distribution` | Gauge(version) | `migrate/reencrypt` — sample during batch |
| `notifications_generated` | Log (structured) | `generate_daily_notifications()` |
| `notification_retention_deleted` | Counter | `cleanup_old_notifications()` §1.5 |

### Alert Rules

| Alert | Condition | Severity |
|-------|-----------|----------|
| Encryption error rate | `rate(encryption_migration_errors_total[5m]) > 0.01` | P1 |
| Migration stalled | `encryption_migration_remaining_rows` unchanged 5min | P2 |
| Encrypt latency | `histogram_quantile(0.95, encrypt_field_duration_seconds) > 0.5s` | P2 |
| Timezone errors | `rate(notification_timezone_error_total[1h]) > 5` | P2 |
| Stale key version | `encryption_key_version_distribution{version="0"} > 0` after rotation SLA | P2 |

---

## Appendix A — V11 Change Summary

| V10 Issue (from reviews) | Fix | Section |
|---|---|---|
| D14 not wired into write path | `encrypt_field` aliased to `encrypt_field_versioned`. All call sites use versioned. | §5.2, §5.2c, §5.4 |
| Reverse migration: wrong decrypt + no OCC | Rewritten with `decrypt_field_versioned` + OCC WHERE + assert flag | §5.7 (D16) |
| Health check gate manual/impossible | Automated `kubectl rollout status` + CODE_VERSION health check | Deployment §12 |
| `time(hour+1)` crash at 23:00 | Replaced with `_safe_localize` using round-trip comparison | §1.3 |
| DST fallback is dead code | `_safe_localize` detects gaps via UTC round-trip, logs, proceeds | §1.3 |
| `CONCURRENTLY` inside Alembic transaction | Separate migration files with `autocommit_block()` | §4.2, Invariants |
| UUIDv4 cursor skips concurrent inserts | `created_at` cursor + assert `ENCRYPTION_ACTIVE=true` before migration | §5.4 |
| Missing re-encryption job | `scripts/reencrypt_data.py` with OCC pattern | §5.8 |
| Background crons during rollout | `CRON_MAINTENANCE_MODE` flag, pause at Step 8, resume at Step 14 | Deployment (D19) |
| Observability metrics not instrumented | Each metric mapped to exact code location | Observability table |
| API returns raw ciphertext | `NotificationResponse.from_db` decrypts before serialization | §1.4 |
| No notification retention | Nightly cleanup job for dismissed notifications > 90 days | §1.5 |
| Migration error rows lost forever | Dead-letter ID list logged + Step 16c verification | §5.4 |
| Forward migration unversioned | Uses `encrypt_field_versioned` (uniform `v{N}:` format) | §5.4 |
| `ENCRYPTION_KEYS` can shrink | Startup validator + append-only documented invariant | §5.2b |
| Missing rescue concurrent dedup test | Test 4.11 added | Test Plan |
| Upsert WHERE clause unverified | Test 1.23: log + assert compiled SQL | Test Plan |
| No key version distribution metric | `encryption_key_version_distribution` gauge + alert | Observability |
| Rolling deploy test too weak | Documented as integration/load test requirement (not unit-testable) | Test Plan note |

### Appendix B — Interaction Audit `[V11-FIX]`

| Section | Interacts With | Risk | Action |
|---|---|---|---|
| Feature 2 (Recurring) | Notification generation | Low | Integration test: recurring → notification |
| Feature 4.1 (Rescue) | Notification dedup index | Medium | Test 4.11: concurrent launcher |
| Feature 4.4 (Trajectory) | Migration 010 | **Resolved** | Migration before code |
| API GET/POST | Encrypted body | **Resolved** | `from_db` decrypts (§1.4, Test 1.21) |
| **Background crons** | Schema + flag | **Resolved** | `CRON_MAINTENANCE_MODE` (D19) |
| Feature 6 (Heatmap) | None | None | — |

### Appendix C — Operational Invariants Checklist `[V11-NEW]`

Before executing Sprint 6, ops team must confirm:

- [ ] `ENCRYPTION_KEYS` is configured and `[0]` is non-empty
- [ ] `ACTIVE_KEY_VERSION` = 0
- [ ] `ENCRYPTION_ACTIVE` = false (will be flipped at Step 13)
- [ ] `CRON_MAINTENANCE_MODE` = false (will be set at Step 8)
- [ ] `CODE_VERSION` = 11 in new Docker image
- [ ] `ENCRYPTION_MIN_VERSION` = 11
- [ ] `/health` endpoint returns `CODE_VERSION` field
- [ ] `kubectl rollout status` accessible from CI/CD
- [ ] `scripts/encrypt_data.py` and `scripts/decrypt_data.py` tested in staging
- [ ] Prometheus/Grafana dashboards include new metrics
- [ ] Dead-letter log drain configured (CloudWatch/Datadog/etc.)
