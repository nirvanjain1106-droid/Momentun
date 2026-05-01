# Sprint 6 — Implementation Plan Part 2 (Revision 12 — Production-Final)

> [!IMPORTANT]
> Test plan, deployment order, rollback, and observability. Changes from v11 marked `[V12-FIX]`.

---

## Section A — Test Plan (283 targets)

> [!NOTE]
> +22 from Rev 11 (261). Every V12 fix has at least one verifiable test.

### A.1 Encryption Core (34 targets, +9 from V11)

| # | Test | Assertion |
|---|------|-----------|
| 5.1 | `test_encrypt_decrypt_roundtrip` | `decrypt(encrypt(plaintext)) == plaintext` |
| 5.2 | `test_encrypt_returns_versioned_format` | Output matches `r"^v\d+:.+"` |
| 5.3 | `test_encrypt_none_returns_none` | `encrypt(None) is None` |
| 5.4 | `test_encrypt_empty_returns_empty` | `encrypt("") == ""` |
| 5.5 | `test_decrypt_legacy_no_prefix` | Legacy ciphertext (no `v{N}:`) decrypts with key[0] |
| 5.6 | `test_decrypt_versioned_v0` | `v0:token` → decrypts with key[0] |
| 5.7 | `test_decrypt_versioned_v1` | `v1:token` → decrypts with key[1] |
| 5.8 | `test_decrypt_invalid_key_version_raises` | `v99:token` → `ValueError` |
| 5.9 | `test_decrypt_corrupted_token_raises` | `v0:garbage` → `InvalidToken` |
| 5.10 | `test_active_key_version_out_of_range_startup_crash` | Settings validation catches it |
| 5.11 | `test_split_format_roundtrip` `[V12]` | encrypt output split by `":"` returns exactly 2 parts |
| 5.12 | `test_parse_version_prefix_single_digit` `[V12]` | `_parse_version_prefix("v0:abc")` → `(0, "abc")` |
| 5.13 | `test_parse_version_prefix_multi_digit` `[V12]` | `_parse_version_prefix("v10:abc")` → `(10, "abc")` |
| 5.14 | `test_parse_version_v10_not_matched_as_v1` `[V12]` | `_parse_version_prefix("v10:x")` returns `(10, "x")` NOT `(1, "0:x")` |
| 5.15 | `test_parse_version_prefix_legacy` `[V12]` | `_parse_version_prefix("raw_token")` → `(0, "raw_token")` |
| 5.16 | `test_all_encryption_keys_validated` `[V12]` | `ENCRYPTION_KEYS=["valid", "", "valid"]` → startup crash |
| 5.17 | `test_encrypt_field_alias_is_versioned` `[V12]` | `encrypt_field is encrypt_field_versioned` |
| 5.18 | `test_decrypt_field_alias_is_versioned` `[V12]` | `decrypt_field is decrypt_field_versioned` |
| 5.19 | `test_decrypt_plaintext_raises_invalid_token` `[V12]` | `decrypt_field_versioned("hello world")` → `InvalidToken` |
| Remaining | Existing v10 tests 5.20-5.34 | unchanged |

### A.2 Migration Scripts (26 targets, +11 from V11)

| # | Test | Assertion |
|---|------|-----------|
| M.1 | `test_forward_migration_basic` | 10 plaintext rows → all encrypted, `evening_note=None` |
| M.2 | `test_forward_migration_skips_already_encrypted` | Re-running processes 0 rows |
| M.3 | `test_forward_migration_occ_concurrent_edit` | Row modified mid-batch → `rowcount=0`, not crash |
| M.4 | `test_forward_migration_asserts_encryption_active` | `ENCRYPTION_ACTIVE=false` → `AssertionError` |
| M.5 | `test_forward_migration_circuit_breaker` | 10 consecutive Fernet failures → `RuntimeError` |
| M.6 | `test_forward_migration_dead_letter_persisted` `[V12]` | Error row → entry in `encryption_dead_letters` table |
| M.7 | `test_forward_migration_composite_cursor_no_skip` `[V12]` | 20 rows with identical `created_at` → ALL processed |
| M.8 | `test_forward_migration_cursor_batch_boundary_ties` `[V12]` | batch_size=5, 12 rows at same timestamp → all 12 encrypted |
| M.9 | `test_reverse_migration_basic` | 10 encrypted rows → all plaintext |
| M.10 | `test_reverse_migration_occ_guard` | Row modified mid-batch → skipped, not corrupted |
| M.11 | `test_reverse_migration_asserts_encryption_inactive` | `ENCRYPTION_ACTIVE=true` → `AssertionError` |
| M.12 | `test_reverse_migration_dead_letter_persisted` `[V12]` | Corrupted row → dead letter entry |
| M.13 | `test_reverse_migration_composite_cursor` `[V12]` | Same timestamp tie handling as forward |
| M.14 | `test_reencrypt_basic` `[V12]` | v0 rows → re-encrypted to v1 (after setting ACTIVE=1) |
| M.15 | `test_reencrypt_skips_current_version` `[V12]` | v1 rows untouched when ACTIVE=1 |
| M.16 | `test_reencrypt_v10_not_confused_with_v1` `[V12]` | v10 rows re-encrypted when ACTIVE=2 |
| M.17 | `test_reencrypt_no_target_version_param` `[V12]` | Function has no `target_version` parameter |
| M.18 | `test_reencrypt_dead_letter_on_error` `[V12]` | Bad row → dead letter entry |
| M.19 | `test_reencrypt_composite_cursor` `[V12]` | Timestamp ties handled |
| Remaining | M.20-M.26 from v10 | unchanged |

### A.3 Notifications (31 targets, +7 from V11)

| # | Test | Assertion |
|---|------|-----------|
| N.1 | `test_morning_checkin_do_nothing_upsert` | Second insert is no-op (ON CONFLICT DO NOTHING) |
| N.2 | `test_task_reminder_upsert_preserves_ack` | Upserted reminder does NOT clear `dismissed_at`/`delivered_at` |
| N.3 | `test_task_reminder_upsert_updates_fire_at` | New `fire_at` replaces old if not dismissed |
| N.4 | `test_notification_body_encrypted` | `body_encrypted` matches `r"^v\d+:.+"` |
| N.5 | `test_api_list_200_with_decrypted_body` | GET returns plaintext body |
| N.6 | `test_api_list_survives_corrupted_row` `[V12]` | One bad ciphertext → 200 response, body=`"[encrypted]"` for that row |
| N.7 | `test_api_list_mixed_valid_invalid` `[V12]` | 5 valid + 1 corrupted → 6 items returned, 5 decrypted, 1 placeholder |
| N.8 | `test_retention_batched_delete` `[V12]` | 5000 dismissed rows cleaned up, no single DELETE > 1000 |
| N.9 | `test_retention_does_not_delete_undismissed` | Undismissed notifications survive cleanup |
| N.10 | `test_safe_localize_normal_time` | 10:00 AM EST → correct UTC |
| N.11 | `test_safe_localize_dst_spring_forward_hour` | `America/New_York` 2:30 AM → detected |
| N.12 | `test_safe_localize_dst_30min_shift` `[V12]` | `Australia/Lord_Howe` +10:30→+11:00, 2:15 AM → gap detected |
| N.13 | `test_safe_localize_kathmandu_offset` `[V12]` | `Asia/Kathmandu` +5:45 → correct UTC (no false gap) |
| N.14 | `test_safe_localize_no_crash_at_2300` `[V12]` | 23:00 in any TZ → valid UTC, no `time(24,0)` crash |
| N.15 | `test_partial_index_predicate_exact_match` `[V12]` | SQLAlchemy `index_where` matches actual DB index DDL |
| Remaining | N.16-N.31 from v10 | unchanged |

### A.4 Rescue Mission (11 targets, unchanged)
### A.5 Heatmap (8 targets, unchanged)
### A.6 Trajectory / Milestones (14 targets, unchanged)

### A.7 Infrastructure & Deployment (12 targets, +6 from V11)

| # | Test | Assertion |
|---|------|-----------|
| I.1 | `test_alembic_concurrent_index_autocommit` | Migration 007b runs without `CONCURRENTLY inside transaction` error |
| I.2 | `test_alembic_version_requirement` `[V12]` | `alembic.__version__` ≥ 1.11 assertion passes |
| I.3 | `test_pg_version_gte_11` `[V12]` | `SELECT version()` returns ≥ 11 |
| I.4 | `test_health_endpoint_returns_code_version` `[V12]` | `GET /health` → `{"code_version": 12, ...}` |
| I.5 | `test_health_endpoint_returns_encryption_status` `[V12]` | `GET /health` → `{"encryption_active": bool}` |
| I.6 | `test_cron_maintenance_mode_skips_tasks` `[V12]` | `CRON_MAINTENANCE_MODE=true` → cron no-ops |
| I.7 | `test_dead_letter_table_created` `[V12]` | Table `encryption_dead_letters` exists after migration |
| I.8 | `test_dead_letter_unresolved_index` `[V12]` | Index `ix_dead_letters_unresolved` exists |
| Remaining | I.9-I.12 from v10 | unchanged |

### A.8 Other Existing Tests (147 targets, unchanged)
- Schedule generation, task CRUD, auth, goals — no changes in v12.

---

## Section B — Deployment Order

```
PRE-FLIGHT CHECKS
──────────────────────────────────────────────────────────────────
 P1. SELECT version() → assert >= '11.0'
 P2. python -c "import alembic; assert alembic.__version_tuple__ >= (1,11)"
 P3. Run full test suite → 283 green

ADDITIVE MIGRATIONS (safe — old code ignores new tables/columns)
──────────────────────────────────────────────────────────────────
  1. alembic upgrade → 006 (Notifications table + inline indexes)
  2. alembic upgrade → 007 (Recurring rules table)
  3. alembic upgrade → 007b (CONCURRENT indexes — autocommit file)
  4. alembic upgrade → 008 (Milestones table)
  5. alembic upgrade → 009 (Heatmap CONCURRENT index — autocommit file)
  6. alembic upgrade → 010 (Trajectory bonus columns)
  7. alembic upgrade → 011 (Encryption columns on daily_logs)
  8. alembic upgrade → 011b (encryption_dead_letters table)

CRON BRACKET START
──────────────────────────────────────────────────────────────────
  9. Set CRON_MAINTENANCE_MODE=true in env/ConfigMap
 10. kubectl rollout restart deployment/worker  ← [V12: explicit restart]
 11. Verify: kubectl exec <worker-pod> -- env | grep CRON_MAINTENANCE_MODE
     → must show 'true'

DEPLOY FEATURE CODE
──────────────────────────────────────────────────────────────────
 12. Deploy app image v12 with ENCRYPTION_ACTIVE=false
 13. kubectl rollout status deployment/api --timeout=300s
 14. GATE: Verify CODE_VERSION on ALL pods:
     for pod in $(kubectl get pods -l app=api -o name); do
       VERSION=$(kubectl exec $pod -- curl -s localhost:8000/health | jq .code_version)
       if [ "$VERSION" != "12" ]; then
         echo "ABORT: $pod has version $VERSION"
         exit 1
       fi
     done
     → All must return 12. FAIL pipeline if any mismatch.

ENCRYPTION ACTIVATION
──────────────────────────────────────────────────────────────────
 15. Set ENCRYPTION_ACTIVE=true
 16. kubectl rollout restart deployment/api  ← [V12: explicit restart for env var]
 17. kubectl rollout status deployment/api --timeout=300s
 18. Verify: curl -s <api>/health | jq -e '.encryption_active == true'

DATA MIGRATION
──────────────────────────────────────────────────────────────────
 19. Run: python scripts/migrate_evening_notes.py
     → Watch logs for "encryption_migration_complete"
 20. Three-query verification:
       a. SELECT COUNT(*) FROM daily_logs
            WHERE evening_note IS NOT NULL AND evening_note_encrypted = FALSE;
          → Must be 0
       b. SELECT COUNT(*) FROM daily_logs
            WHERE evening_note_ciphertext IS NOT NULL AND evening_note_encrypted = TRUE;
          → Must equal total encrypted
       c. SELECT COUNT(*) FROM encryption_dead_letters
            WHERE source_table = 'daily_logs' AND resolved_at IS NULL;
          → Must be 0. If > 0, investigate and resolve before continuing.

CRON BRACKET END
──────────────────────────────────────────────────────────────────
 21. Set CRON_MAINTENANCE_MODE=false
 22. kubectl rollout restart deployment/worker  ← [V12: explicit restart]
 23. Verify: kubectl exec <worker-pod> -- env | grep CRON_MAINTENANCE_MODE
     → must show 'false'
```

---

## Section C — Rollback Procedures

### C.1 Rollback Matrix

| Phase | Rollback Path | Safe? | Notes |
|-------|---------------|-------|-------|
| Steps 1-8 (migrations) | `alembic downgrade` per migration | ✅ Yes | Additive only. Old code ignores new columns/tables |
| Steps 9-14 (code deploy, enc=false) | Revert to old image | ✅ Yes | No encryption data written yet |
| Steps 15-18 (enc=true, no data migrated) | Set `ENCRYPTION_ACTIVE=false` + `kubectl rollout restart` + revert image | ✅ Yes | Only new writes have ciphertext. These were created by v12 code, so they have plaintext copy (evening_note is set to None only by migration script) |
| Step 19 mid-migration | Stop script → set `ENCRYPTION_ACTIVE=false` → `kubectl rollout restart` → run reverse migration → revert image | ⚠️ Conditional | Dead letters tracked in DB table. Composite cursor restarts safely from min. Check `encryption_dead_letters` for unresolved rows |
| Step 19 completed | Set `ENCRYPTION_ACTIVE=false` → `kubectl rollout restart` → run reverse migration → revert image | ✅ Yes | Reverse migration handles versioned ciphertext. Composite cursor handles ties |

### C.2 Critical Rollback Invariants

```
INVARIANT: Env var changes require explicit pod restart.
  → Every ENCRYPTION_ACTIVE or CRON_MAINTENANCE_MODE change
     is followed by `kubectl rollout restart`.
  → Without restart, running pods keep the old value.
  → This is the #1 cause of mixed-mode corruption.

INVARIANT: Reverse migration requires ENCRYPTION_ACTIVE=false assertion.
  → Prevents reverse migration while writes are still encrypting.
  → Without this, new encrypted rows appear during reverse migration,
     creating an infinite loop.

INVARIANT: Column drop (Migration 012) is a SEPARATE release.
  → NEVER deployed in Sprint 6.
  → Only after 2+ weeks of stable encrypted operation.
  → Irreversible — plaintext column gone forever.
```

---

## Section D — Observability

### D.1 Metrics

| Metric | Type | Location | Alert |
|--------|------|----------|-------|
| `encrypt_field_duration_seconds` | Histogram | `encrypt_field_versioned()` | p99 > 50ms |
| `decrypt_field_duration_seconds` | Histogram | `decrypt_field_versioned()` | p99 > 50ms |
| `encryption_migration_rows_total` | Counter | `migrate_evening_notes()` batch loop | — |
| `encryption_migration_errors_total` | Counter | `migrate_evening_notes()` except block | > 0 in 5m |
| `notification_decrypt_failures_total` | Counter | `NotificationResponse.from_db()` except | > 5 in 5m |
| `notification_retention_deleted_total` | Counter | `cleanup_old_notifications()` | — |
| `notification_retention_batch_count` | Counter | `cleanup_old_notifications()` while loop | — |

### D.2 Structured Log Events

| Event | Severity | Contains |
|-------|----------|----------|
| `dst_gap_detected` | INFO | `requested`, `actual`, `date`, `tz` |
| `notification_decrypt_failed` | ERROR | `notification_id` |
| `encryption_migration_row_error` | ERROR | `daily_log_id`, `error` |
| `encryption_migration_batch` | INFO | `total_migrated`, `total_skipped` |
| `encryption_migration_complete` | INFO | `total_migrated`, `total_skipped` |
| `reverse_migration_error` | ERROR | `daily_log_id`, `error` |
| `reencrypt_error` | ERROR | `daily_log_id`, `error` |
| `notification_retention_cleanup` | INFO | `deleted_count`, `cutoff` |

### D.3 Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| EncryptionMigrationErrors | `encryption_migration_errors_total > 0` for 5m | P1 |
| NotificationDecryptFailures | `notification_decrypt_failures_total > 5` in 5m | P2 |
| CronMaintenanceStuck | `CRON_MAINTENANCE_MODE == true` for > 30 min `[V12-NEW]` | P1 |
| EncryptionLatencyHigh | `encrypt_field_duration_seconds{quantile="0.99"} > 0.05` | P2 |
| DeadLetterBacklog | `COUNT(encryption_dead_letters WHERE resolved_at IS NULL) > 0` `[V12-NEW]` | P1 |

### D.4 Migration Observability Pattern `[V12-FIX]`

```
Problem: Migration is a short-lived job. Prometheus pull-model
         misses metrics from jobs that exit before scrape.

Solution (pick one based on infra):
  A. Prometheus Pushgateway:
     → At script end, push all counters to pushgateway.
     → pushgateway_url = os.environ.get("PUSHGATEWAY_URL")
     → if pushgateway_url: push_to_gateway(pushgateway_url, job='encryption_migration', registry=REGISTRY)

  B. Log-based metrics (recommended for CloudWatch/Datadog/Loki):
     → Migration already emits structured JSON logs.
     → Configure log metric filter: encryption_migration_errors_total from ERROR logs.
     → No additional code needed.

  C. Both: Push + Log. Belt and suspenders.
```

---

## Section E — "Looks Safe But Isn't" — V12 Resolutions

| V11 Claim | V11 Failure Mode | V12 Resolution |
|-----------|------------------|----------------|
| `created_at` cursor is monotonic | Ties skip rows | Composite cursor `(created_at, id)`. Tested by M.7, M.8 |
| `startswith` version check | `v10:` matches `v1:` | Numeric parse via `_parse_version_prefix`. Tested by 5.14, M.16 |
| Dead-letter logging | Truncated at 100, lost on crash | Persisted to `encryption_dead_letters` table. Tested by M.6, M.12, M.18 |
| `encrypt_field` alias | Import caching | Same-module alias. `encrypt_field is encrypt_field_versioned` asserted by 5.17 |
| Health check gate | kubectl only checks readiness | Explicit per-pod `curl /health` + jq version check. Step 14 |
| `_safe_localize` hour check | Misses 30-min shifts | Full naive datetime comparison. Tested by N.12, N.13 |
| Static CRON_MAINTENANCE_MODE | No hot-reload | Explicit `kubectl rollout restart` after every flag change. Steps 10, 16, 22 |
| API list decrypt | One bad row → 500 | try/except per row → `"[encrypted]"`. Tested by N.6, N.7 |
| Unbatched retention DELETE | Table lock, WAL explosion | Batched with LIMIT 1000. Tested by N.8 |
| Migration metrics never scraped | Short-lived job exits | Pushgateway or log-based metrics. §D.4 |

---

## Section F — Cron Maintenance Mode Protocol `[V12-NEW]`

```
WHY: Background crons (notification gen, rescue, retention) must not
     write during the encryption activation window (Steps 15-19).
     If they do, plaintext/ciphertext mixing occurs.

HOW:
  Every cron task starts with:
    if settings.CRON_MAINTENANCE_MODE:
        logger.info("cron_skipped_maintenance_mode", extra={"task": task_name})
        return

WHEN TO ENABLE:
  Step 9 (before code deploy). Restart workers (Step 10).

WHEN TO DISABLE:
  Step 21 (after migration verified). Restart workers (Step 22).

STUCK DETECTION:
  Alert: CronMaintenanceStuck fires if flag is true for > 30 minutes.
  This catches forgotten Step 21 or failed deployments.
```

---

## Section G — Pre-Execution Checklist

```
Before executing Sprint 6:

[ ] PostgreSQL version ≥ 11 confirmed
[ ] Alembic version ≥ 1.11 confirmed
[ ] ENCRYPTION_KEYS has ≥ 1 non-empty key
[ ] ACTIVE_KEY_VERSION < len(ENCRYPTION_KEYS)
[ ] 283 tests pass on staging
[ ] Staging dry-run of migrate_evening_notes.py with 100 test rows
[ ] Dead-letter table created and empty
[ ] /health endpoint returns code_version and encryption_active
[ ] Pushgateway URL configured (or log-based metrics confirmed)
[ ] Rollback procedure reviewed with on-call engineer
[ ] CronMaintenanceStuck alert configured in monitoring
[ ] DeadLetterBacklog alert configured in monitoring
```

---

## Section H — Key Rotation Runbook

```
1. Generate new key. Append to ENCRYPTION_KEYS (index = new version).
2. Set ACTIVE_KEY_VERSION = new version index.
3. kubectl rollout restart deployment/api deployment/worker
4. Verify: new writes use v{new}: prefix (check a fresh row).
5. Run: python scripts/reencrypt_evening_notes.py
6. Verify: SELECT COUNT(*) FROM daily_logs
     WHERE evening_note_encrypted = TRUE
       AND evening_note_ciphertext NOT LIKE 'v{new}:%';
   → Must be 0.
7. Check: SELECT COUNT(*) FROM encryption_dead_letters
     WHERE resolved_at IS NULL;
   → Must be 0.
8. Old keys remain in ENCRYPTION_KEYS for decrypt backward compat.
   NEVER remove keys while any ciphertext references them.
```

---

## Appendix: V12 Change Log

| V11 Item | V12 Change | Trace |
|----------|------------|-------|
| `_safe_localize` hour comparison | Full naive datetime comparison | D18, N.12-N.14 |
| `created_at >` cursor | Composite `(created_at, id)` cursor | D20, I13, M.7-M.8, M.13, M.19 |
| `startswith(f"v{target}")` | `_parse_version_prefix` numeric parse | D21, I12, 5.12-5.15, M.16 |
| `target_version` parameter | Removed. Uses `ACTIVE_KEY_VERSION` | D21, M.17 |
| In-memory dead-letter list | `encryption_dead_letters` DB table | D23, M.6, M.12, M.18 |
| Single `DELETE` retention | Batched with `LIMIT 1000` | D24, N.8 |
| `from_db` unconditional decrypt | try/except → `"[encrypted]"` | D22, N.6-N.7 |
| Static env var reload | Explicit `kubectl rollout restart` | D19, Steps 10/16/22 |
| Health gate hand-waved | Exact `/health` endpoint + per-pod verification script | 5.9, Step 14, I.4-I.5 |
| No stuck-cron alert | `CronMaintenanceStuck` alert at 30 min | §D.3, §F |
| No PG version check | Pre-flight `SELECT version()` + assertion | I11, P1 |
| No Alembic version check | Pre-flight assertion `>= 1.11` | P2 |
| Ephemeral migration metrics | Pushgateway or log-based pattern | §D.4 |
| `ENCRYPTION_KEYS` partial validation | Validate ALL keys in production | 5.16, §5.2b |
