# Sprint 6 — Implementation Plan Part 2 (Revision 14 — Final Hardened)

> [!IMPORTANT]
> Test plan, deployment, rollback, observability. Changes from V13 marked `[V14-FIX]`.

---

## Section A — Test Plan (318 targets, +13 from V13)

### A.1 Encryption Core (42 targets, +3 from V13)

| # | Test | Assertion |
|---|------|-----------|
| 5.1–5.24 | Unchanged from V13 | — |
| 5.25 | `test_encrypt_field_versioned_force_version` `[V14]` | `encrypt_field_versioned("x", force_version=1)` → ciphertext starts with `v1:` |
| 5.26 | `test_encrypt_field_versioned_force_version_roundtrip` `[V14]` | Encrypt with force_version=1 → decrypt → original |
| 5.27 | `test_encrypt_field_versioned_force_version_invalid` `[V14]` | `force_version=999` → `ValueError` |
| Remaining | 5.28–5.42 from V13 | unchanged |

### A.2 Migration Scripts (44 targets, +9 from V13)

| # | Test | Assertion |
|---|------|-----------|
| M.1–M.28 | Unchanged from V13 | — |
| M.29 | `test_dead_letter_write_failure_does_not_crash_migration` `[V14]` | Mock SAVEPOINT to raise. Assert loop continues, batch commits, error logged. |
| M.30 | `test_resolve_dead_letters_batches_memory` `[V14]` | Insert 5k DL rows. Run script. Assert processes in batches of BATCH_SIZE, no OOM. |
| M.31 | `test_resolve_dead_letters_one_bad_row_does_not_block_others` `[V14]` | 3 DL rows, row 2 raises on encrypt. Assert rows 1 and 3 resolved, row 2 still_failing. |
| M.32 | `test_dead_letter_created_at_preserved_on_retry` `[V14]` | Insert DL, trigger retry via ON CONFLICT. Assert `created_at` unchanged, `last_retry_at` updated. |
| M.33 | `test_reencrypt_uses_encrypt_field_versioned` `[V14]` | Mock `encrypt_field_versioned`. Run re-encryption. Assert called with `force_version=target`. Assert NO direct `Fernet()` calls. |
| M.34 | `test_post_migration_sweep_limit_one` `[V14]` | 10k rows, sweep returns immediately. Assert query uses `LIMIT 1`. |
| M.35 | `test_migration_pool_not_exhausted_under_errors` `[V14]` | 50 rows fail in batch. Assert total DB connections stays ≤ pool_size + max_overflow. |
| M.36 | `test_reverse_migration_requires_maintenance_mode` `[V14]` | `CRON_MAINTENANCE_MODE=false` → `RuntimeError`. |
| M.37 | `test_forward_migration_dl_uses_savepoint` `[V14]` | Assert `_write_dead_letter` uses `db.begin_nested()`, not `AsyncSessionLocal()`. |

### A.3 Notifications (34 targets, +3 from V13)

| # | Test | Assertion |
|---|------|-----------|
| N.1–N.31 | Unchanged from V13 | — |
| N.32 | `test_retention_uses_index_not_seqscan` `[V14]` | `EXPLAIN ANALYZE` retention query. Assert `Index Scan` on `ix_notifications_retention`, NOT `Seq Scan`. |
| N.33 | `test_retention_skip_locked_with_partial_index` `[V14]` | Concurrent lock on 10 rows. Assert retention skips them, deletes others. No seqscan. |
| N.34 | `test_retention_does_not_saturate_disk_io` `[V14]` | Retention on 100k row table. Assert query plan cost estimate is bounded. |

### A.4 DailyLog Read Path (5 targets, unchanged logic, updated assertion)

| # | Test | Assertion |
|---|------|-----------|
| DL.1–DL.2 | Unchanged | — |
| DL.3 | `test_get_evening_note_corrupt_ciphertext` `[V14-FIX]` | Truncated ciphertext → returns `None` (was `"[encrypted]"`), error logged |
| DL.4 | `test_get_evening_note_encrypted_null_ciphertext` | `encrypted=True, ciphertext=None` → returns `None` + error log |
| DL.5 | Unchanged | — |

### A.5–A.7 — Unchanged from V13

### A.8 Infrastructure & Deployment (15 targets, unchanged count but updated)

| # | Test | Assertion |
|---|------|-----------|
| I.1–I.11 | Unchanged from V13 | — |
| I.12 | `test_dead_letter_table_has_last_retry_at` `[V14]` | Column exists, nullable |
| I.13 | `test_retention_partial_index_exists` `[V14]` | `ix_notifications_retention` exists in pg_indexes |
| I.14–I.15 | From V13 | unchanged |

### A.9 Other Existing Tests (147 targets, unchanged)

---

## Section B — Deployment Order `[V14-FIX]`

```
PRE-FLIGHT CHECKS
──────────────────────────────────────────────────────────────────
 P1. Pre-flight PG version check (unchanged from V13)
 P2. Pre-flight Alembic version check (unchanged from V13)
 P3. Run full test suite → 318 green

ADDITIVE MIGRATIONS
──────────────────────────────────────────────────────────────────
  1. alembic upgrade → 006 (Notifications table + inline indexes)
  2. alembic upgrade → 007 (Recurring rules table)
  3. alembic upgrade → 007b (CONCURRENT indexes — autocommit file)
  4. alembic upgrade → 008 (Milestones table)
  5. alembic upgrade → 009 (Heatmap CONCURRENT index — autocommit file)
  6. alembic upgrade → 010 (Trajectory bonus columns)
  7. alembic upgrade → 011 (Encryption columns on daily_logs)
  8. alembic upgrade → 011b (encryption_dead_letters table
                              + last_retry_at column [V14])
  8b.[V14] alembic upgrade → 011c (ix_notifications_retention partial index)

CRON BRACKET START
──────────────────────────────────────────────────────────────────
  9. Set CRON_MAINTENANCE_MODE=true in env/ConfigMap

 10. [V14-FIX] kubectl rollout restart deployment/worker
     NOTE: Worker deployment SHOULD have preStop hook:
       lifecycle:
         preStop:
           exec:
             command: ["/bin/sh", "-c", "sleep 10"]
     This prevents cron straggler writes during SIGTERM window.

 11. Verify:
     kubectl exec $(kubectl get pod -l app=worker \
       -o jsonpath='{.items[0].metadata.name}') \
       -- env | grep CRON_MAINTENANCE_MODE
     → must show 'true'

DEPLOY FEATURE CODE
──────────────────────────────────────────────────────────────────
 12. Deploy app image v14 with ENCRYPTION_ACTIVE=false
 13. kubectl rollout status deployment/api --timeout=300s

 14. [V14-FIX] GATE: Verify CODE_VERSION on all READY pods:
     #!/bin/bash
     set -euo pipefail
     EXPECTED=14

     # V14-FIX (M1): Use rollout status first, then check ready pods only
     kubectl rollout status deployment/api --timeout=300s

     PODS=$(kubectl get pods -l app=api \
       --field-selector=status.phase=Running \
       -o json | jq -r '
         .items[]
         | select(.metadata.deletionTimestamp == null)
         | select(.status.conditions[]?
             | select(.type=="Ready" and .status=="True"))
         | .metadata.name')

     if [ -z "$PODS" ]; then
       echo "ABORT: No ready pods found"
       exit 1
     fi

     for pod in $PODS; do
       # V14-FIX (M2): Use jq instead of python3
       VERSION=$(kubectl exec "$pod" -- \
         curl -sf localhost:8000/health 2>/dev/null | jq -r '.code_version')
       if [ "$VERSION" != "$EXPECTED" ]; then
         echo "ABORT: $pod has version $VERSION, expected $EXPECTED"
         exit 1
       fi
       echo "OK: $pod → v$VERSION"
     done
     echo "All pods verified at v$EXPECTED"

ENCRYPTION ACTIVATION
──────────────────────────────────────────────────────────────────
 15. Set ENCRYPTION_ACTIVE=true
 16. kubectl rollout restart deployment/api
 17. kubectl rollout status deployment/api --timeout=300s
 18. Verify: curl -sf <api>/health | jq '.encryption_active'
     → must be true

DATA MIGRATION
──────────────────────────────────────────────────────────────────
 19. Run: python scripts/migrate_evening_notes.py
     → Watch logs for "encryption_migration_complete"

 20. Verification (all four must pass):

     a. SELECT COUNT(*) FROM daily_logs
          WHERE evening_note IS NOT NULL AND evening_note_encrypted = FALSE;
        → Must be 0

     b. SELECT COUNT(*) FROM daily_logs
          WHERE evening_note_ciphertext IS NOT NULL
            AND evening_note_encrypted = TRUE;
        → Must equal total encrypted rows

     c. SELECT COUNT(*) FROM encryption_dead_letters
          WHERE source_table = 'daily_logs'
            AND operation = 'encrypt'
            AND resolved_at IS NULL;
        → Must be 0. If > 0:
          → Run: python scripts/resolve_dead_letters.py
          → Repeat 20c until 0.

     d. [V14-FIX] Post-migration sweep with LIMIT 1:
        SELECT id FROM daily_logs
          WHERE evening_note IS NOT NULL
            AND evening_note_encrypted = FALSE
          LIMIT 1;
        → Must return 0 rows. If returns row, re-run migration script.

CRON BRACKET END
──────────────────────────────────────────────────────────────────
 21. Set CRON_MAINTENANCE_MODE=false
 22. kubectl rollout restart deployment/worker
 23. Verify: env shows 'false'
```

---

## Section C — Rollback Procedures `[V14-FIX]`

### C.1 Rollback Matrix

| Phase | Safe? | Procedure |
|-------|-------|-----------|
| Steps 1-8 (migrations only) | ✅ Yes | `alembic downgrade` per migration. Additive only. |
| Steps 9-14 (code deployed, enc=false) | ✅ Yes | Revert image. No encrypted data written. |
| Steps 15-18 (enc=true, no data migrated) | ⚠️ **Conditional** | **MUST** set `CRON_MAINTENANCE_MODE=true` → set `ENCRYPTION_ACTIVE=false` → restart → run `reverse_migrate_evening_notes.py` → verify → revert image. |
| Step 19 mid-migration | ⚠️ Conditional | Stop script → set maint mode → set enc=false → restart → run reverse migration → check dead letters → revert. |
| Step 19 completed | ⚠️ Conditional | Same as above. Reverse migration handles mixed state. |
| **After Step 20 (Day 3+)** `[V14-NEW]` | ⚠️ **Conditional** | Set `CRON_MAINTENANCE_MODE=true` → restart workers → set `ENCRYPTION_ACTIVE=false` → restart API → run `reverse_migrate_evening_notes.py`. Reverse migration only touches `encrypted=True` rows. New plaintext rows (written after enc=false) are untouched. System converges to uniformly plaintext. Verified safe. |
| After Migration 012 (column drop) | ❌ **Irreversible** | NOT deployed in Sprint 6. |

### C.2 Critical Rollback Invariants

```
INVARIANT 1 (I16): After ENCRYPTION_ACTIVE=true, ANY rollback to pre-v14
  code requires running reverse migration first.

INVARIANT 2: Env var changes require explicit kubectl rollout restart.

INVARIANT 3: Column drop (Migration 012) is NEVER in Sprint 6.

INVARIANT 4 [V14]: Reverse migration MUST run in maintenance mode.
  CRON_MAINTENANCE_MODE=true prevents concurrent writes that could
  shift cursor position during rollback.

INVARIANT 5 [V14]: Day 3+ rollback is safe. Reverse migration only
  processes encrypted=True rows. Plaintext rows written after
  disabling encryption are left untouched.
```

---

## Section D — Observability

### D.1 Metrics — Unchanged from V13, plus:

| Metric | Type | Location |
|--------|------|----------|
| `dead_letter_write_failures_total` `[V14]` | Counter | `_write_dead_letter()` except block |
| `dead_letter_resolution_batch_total` `[V14]` | Counter | `resolve_dead_letters.py` batch loop |

### D.2 Structured Log Events — V13 plus:

| Event | Severity | Contains |
|-------|----------|----------|
| `dead_letter_write_failed` `[V14]` | ERROR | `source_row_id`, `dl_error` |

### D.3–D.4 — Unchanged from V13

---

## Section E — Pre-Execution Checklist `[V14-FIX]`

```
Before executing Sprint 6:

PRE-FLIGHT
[ ] PostgreSQL version ≥ 11 confirmed (SHOW server_version_num >= 110000)
[ ] Alembic version ≥ 1.11 confirmed
[ ] ENCRYPTION_KEYS has ≥ 1 non-empty key (all validated)
[ ] ACTIVE_KEY_VERSION >= 0 AND < len(ENCRYPTION_KEYS)
[ ] 318 tests pass on staging
[ ] Python container does NOT use -O / PYTHONOPTIMIZE=1
[ ] [V14] jq is available in API pod image (verify: kubectl exec <pod> -- jq --version)
[ ] [V14] Worker deployment has preStop hook configured

STAGING DRY-RUN
[ ] Run migrate_evening_notes.py on staging with 100 test rows
[ ] Verify dead-letter table is empty after successful migration
[ ] Inject 1 corrupt row, rerun → dead letter created
[ ] [V14] Inject DL write failure (drop DL table) → migration loop continues
[ ] Run resolve_dead_letters.py → dead letter resolved
[ ] [V14] Inject 3 DL rows, 1 permanently failing → other 2 resolve
[ ] Run reverse_migrate_evening_notes.py → all rows decrypted
[ ] [V14] Verify ix_notifications_retention index exists
[ ] [V14] EXPLAIN ANALYZE retention query → Index Scan confirmed

INFRASTRUCTURE
[ ] /health endpoint returns code_version and encryption_active
[ ] Pushgateway URL configured (or log-based metrics confirmed)
[ ] CronMaintenanceStuck alert configured (30 min threshold)
[ ] DeadLetterBacklog alert configured
[ ] DailyLogDecryptFailures alert configured
[ ] [V14] dead_letter_write_failures_total alert configured

OPERATIONAL READINESS
[ ] Rollback procedure reviewed with on-call (ALL phases = CONDITIONAL after Step 15)
[ ] [V14] Day 3+ rollback procedure reviewed and understood
[ ] resolve_dead_letters.py tested on staging
[ ] Team acknowledges: column drop (012) is NOT in this release

PRODUCT SIGN-OFF REQUIRED
[ ] [V14] _safe_localize DST gap behavior: reviewed by product team
    Options: (a) fire early, (b) skip reminder, (c) schedule at next valid time
    Current behavior: fires ~1 hour early. Documented as conscious trade-off.
    Review 2 flags this as a user-facing bug. Needs product decision.
```

---

## Section F — Key Rotation Runbook — Unchanged from V13
(now uses `encrypt_field_versioned(force_version=)` per D32)

## Section G — Cron Maintenance Mode Protocol — Unchanged from V13

## Section H — Dead-Letter Resolution Runbook `[V14-FIX]`

```
WHEN TO USE:
  Step 20c shows unresolved dead letters > 0.
  OR DeadLetterBacklog alert fires.

PROCEDURE:
  1. Inspect: SELECT source_row_id, error_message, created_at, last_retry_at
       FROM encryption_dead_letters
       WHERE resolved_at IS NULL ORDER BY created_at;
     → Check error_message for patterns (KMS rate limit, bad data, etc.)
     → V14: created_at shows ORIGINAL failure time (never overwritten)
     → V14: last_retry_at shows most recent retry attempt

  2. Fix root cause if systemic.

  3. Retry: python scripts/resolve_dead_letters.py
     → V14: Script processes in batches. One bad row does NOT block others.

  4. Verify: SELECT COUNT(*) FROM encryption_dead_letters
       WHERE resolved_at IS NULL;
     → Must be 0.

  5. If still > 0:
     → Remaining rows have persistent problems.
     → Options: (a) fix source data, (b) accept data loss and mark resolved.
     → Document decision in incident log.

CLEANUP (automated — add to nightly cron):
  DELETE FROM encryption_dead_letters
    WHERE resolved_at IS NOT NULL
      AND created_at < NOW() - INTERVAL '90 days';
```

---

## Section I — "Looks Safe But Isn't" — Fixed in V14

| V13 Claim | Why It Failed | V14 Fix |
|-----------|---------------|---------|
| `_write_dead_letter` isolated session | Opens new connection per error → pool exhaustion | SAVEPOINT within main session (D31) |
| `_write_dead_letter` called in except block | DL write failure escapes except → crashes loop | Inner try/except in `_write_dead_letter` (I18) |
| `resolve_dead_letters.py` idempotent | Loads all rows into memory → OOM at 50k+ | Keyset pagination, BATCH_SIZE=500 |
| `resolve_dead_letters.py` commits at end | One bad row rolls back all resolutions | Per-row commit with error isolation |
| DL `ON CONFLICT` refreshes timestamp | Overwrites `created_at` → SLA metrics broken | `last_retry_at` column, `created_at` immutable |
| Re-encryption uses same key derivation | Inline Fernet diverges from `encrypt_field_versioned` | `force_version` parameter, single code path |
| Health gate `status.phase=Running` | Includes terminating pods → false pipeline abort | `jq` filter + deletionTimestamp + Ready check |
| Post-migration sweep catches stragglers | Full table scan times out on large tables | `LIMIT 1` on sweep query |
| Retention `SKIP LOCKED` prevents blocking | No covering index → sequential scan I/O saturation | Partial index `ix_notifications_retention` |
| `get_evening_note` returns `"[encrypted]"` | Breaks mobile/web JSON parsers expecting string or null | Returns `None` |
| Rollback after Step 20 not needed | No documented procedure → ops improvises | Day 3+ rollback matrix entry |
| Reverse migration same proven cursor | Concurrent user edits can shift cursor during rollback | Maintenance mode gate enforced |

---

## Appendix: V14 Change Log

| V13 Item | V14 Change | Trace |
|----------|------------|-------|
| `_write_dead_letter` separate AsyncSession | SAVEPOINT within main session | D31, C3, §5.4 |
| `_write_dead_letter` can crash except block | Inner try/except, never aborts loop | I18, B1, §5.4 |
| `resolve_dead_letters` loads all + single commit | Keyset pagination + per-row commit | I19, B2, §5.9 |
| Retention no covering index | `ix_notifications_retention` partial index | B3, §1.5, 011c |
| Re-encryption inline Fernet | `encrypt_field_versioned(force_version=)` | I20, D32, B4, §5.2, §5.8 |
| DL `ON CONFLICT` overwrites `created_at` | `last_retry_at` column, `created_at` immutable | I21, C1, §5.1b, §5.4 |
| Post-migration sweep no LIMIT | `LIMIT 1` | C2, §B Step 20d |
| Health gate python3 + terminating pods | `jq` + Ready condition filter | M1, M2, §B Step 14 |
| No cron straggler protection | `preStop` sleep hook | M3, §B Step 10 |
| No Day 3+ rollback | New matrix entry | M4, §C.1 |
| `get_evening_note` returns `"[encrypted]"` | Returns `None` | D33, M5, §5.3 |
| Reverse migration allows live traffic | `CRON_MAINTENANCE_MODE` gate required | D34, M7, §5.7 |
| `_safe_localize` DST gap undecided | Flagged for product sign-off | M6, §E |
| DL cleanup manual only | Documented for nightly cron | §H |
