# Sprint 6 — Implementation Plan Part 2 (Revision 13 — Production-Final)

> [!IMPORTANT]
> Test plan, deployment, rollback, observability. Changes from V12 marked `[V13-FIX]`.

---

## Section A — Test Plan (305 targets, +22 from V12)

### A.1 Encryption Core (39 targets, +5 from V12)

| # | Test | Assertion |
|---|------|-----------|
| 5.1–5.10 | Unchanged from V12 | — |
| 5.11 | `test_split_format_roundtrip` | encrypt output split by `":"` returns exactly 2 parts |
| 5.12 | `test_parse_version_prefix_single_digit` | `_parse_version_prefix("v0:abc")` → `(0, "abc")` |
| 5.13 | `test_parse_version_prefix_multi_digit` | `_parse_version_prefix("v10:abc")` → `(10, "abc")` |
| 5.14 | `test_parse_version_v10_not_matched_as_v1` | `(10, "abc")` NOT `(1, "0:abc")` |
| 5.15 | `test_parse_version_prefix_legacy` | No prefix → `(0, "raw_token")` |
| 5.16 | `test_all_encryption_keys_validated` | `["valid", "", "valid"]` → startup crash |
| 5.17 | `test_encrypt_field_alias_is_versioned` | `encrypt_field is encrypt_field_versioned` |
| 5.18 | `test_decrypt_field_alias_is_versioned` | `decrypt_field is decrypt_field_versioned` |
| 5.19 | `test_decrypt_plaintext_raises_invalid_token` | `decrypt("hello")` → `InvalidToken` |
| 5.20 | `test_parse_version_regex_no_slice_limit` `[V13]` | `_parse_version_prefix("v1000000:x")` → `(1000000, "x")` |
| 5.21 | `test_config_negative_active_key_version` `[V13]` | `ACTIVE_KEY_VERSION=-1` → `ValueError` at startup |
| 5.22 | `test_config_empty_encryption_keys` `[V13]` | `ENCRYPTION_KEYS=[]` → `ValueError` at startup |
| 5.23 | `test_parse_version_roundtrip_with_encrypt` `[V13]` | `_parse_version_prefix(encrypt(x))` returns `(ACTIVE, token)` where `Fernet(key).decrypt(token)` works |
| 5.24 | `test_reencrypt_uses_snapshot_not_live` `[V13]` | Change `ACTIVE_KEY_VERSION` mid-job → all batches still use original snapshot version |
| Remaining | 5.25–5.39 from V12 | unchanged |

### A.2 Migration Scripts (35 targets, +9 from V12)

| # | Test | Assertion |
|---|------|-----------|
| M.1–M.5 | Unchanged from V12 | — |
| M.6 | `test_forward_migration_dead_letter_persisted` | Error row → entry in `encryption_dead_letters` |
| M.7 | `test_forward_migration_composite_cursor_no_skip` | 20 rows, identical `created_at` → ALL processed |
| M.8 | `test_forward_migration_cursor_batch_boundary_ties` | batch_size=5, 12 tied rows → all 12 encrypted |
| M.9–M.19 | Unchanged from V12 | — |
| M.20 | `test_forward_migration_if_raise_not_assert` `[V13]` | Run with `PYTHONOPTIMIZE=1` + `ENCRYPTION_ACTIVE=false` → `RuntimeError` (not silently skipped) |
| M.21 | `test_reverse_migration_if_raise_not_assert` `[V13]` | Run with `PYTHONOPTIMIZE=1` + `ENCRYPTION_ACTIVE=true` → `RuntimeError` |
| M.22 | `test_dead_letter_survives_batch_rollback` `[V13]` | Force `db.commit()` error → dead-letter row still in DB (separate session) |
| M.23 | `test_dead_letter_upsert_on_retry` `[V13]` | Run migration twice on same bad row → exactly 1 unresolved dead-letter entry |
| M.24 | `test_dead_letter_resolve_basic` `[V13]` | `resolve_dead_letters.py` retries errored row → encrypted + dead letter marked resolved |
| M.25 | `test_dead_letter_resolve_already_encrypted` `[V13]` | Row manually fixed → `resolve_dead_letters.py` marks resolved without re-encrypting |
| M.26 | `test_dead_letter_resolve_deleted_row` `[V13]` | Source row deleted → dead letter marked resolved |
| M.27 | `test_post_migration_sweep_finds_stragglers` `[V13]` | Insert plaintext row with small UUID during migration → Step 20d sweep catches it |
| M.28 | `test_reencrypt_snapshot_version_frozen` `[V13]` | Matches 5.24 at integration level |
| Remaining | M.29–M.35 from V12 | unchanged |

### A.3 Notifications (31 targets, unchanged from V12)

### A.4 DailyLog Read Path `[V13-NEW section]` (5 targets)

| # | Test | Assertion |
|---|------|-----------|
| DL.1 | `test_get_evening_note_plaintext` | Non-encrypted row → returns `evening_note` |
| DL.2 | `test_get_evening_note_encrypted` | Encrypted row → decrypted plaintext |
| DL.3 | `test_get_evening_note_corrupt_ciphertext` `[V13]` | Truncated ciphertext → returns `"[encrypted]"`, not 500 |
| DL.4 | `test_get_evening_note_encrypted_null_ciphertext` `[V13]` | `encrypted=True, ciphertext=None` → returns `None` + error log |
| DL.5 | `test_get_evening_note_none` | `evening_note=None, encrypted=False` → returns `None` |

### A.5 Rescue Mission (11 targets, unchanged)
### A.6 Heatmap (8 targets, unchanged)
### A.7 Trajectory / Milestones (14 targets, unchanged)

### A.8 Infrastructure & Deployment (15 targets, +3 from V12)

| # | Test | Assertion |
|---|------|-----------|
| I.1 | `test_alembic_concurrent_index_autocommit` | No `CONCURRENTLY inside transaction` error |
| I.2 | `test_alembic_version_requirement` `[V13-FIX]` | `parse_version(alembic.__version__) >= parse_version("1.11")` |
| I.3 | `test_pg_version_gte_11` `[V13-FIX]` | `SHOW server_version_num` returns integer ≥ 110000 |
| I.4 | `test_health_endpoint_returns_code_version` | `GET /health` → `code_version: 13` |
| I.5 | `test_health_endpoint_returns_encryption_status` | `GET /health` → `encryption_active: bool` |
| I.6 | `test_cron_maintenance_mode_skips_tasks` | `CRON_MAINTENANCE_MODE=true` → cron no-ops |
| I.7 | `test_dead_letter_table_created` | Table exists |
| I.8 | `test_dead_letter_unresolved_index` | Partial index exists |
| I.9 | `test_dead_letter_unique_constraint` `[V13]` | Insert same `(table, row_id, operation)` twice → 1 row (upsert) |
| I.10 | `test_retention_skip_locked` `[V13]` | Locked row → retention proceeds with unlocked rows |
| I.11 | `test_retention_max_batches` `[V13]` | 50k rows + MAX_BATCHES=10 → only 10k deleted, warning logged |
| Remaining | I.12–I.15 from V12 | unchanged |

### A.9 Other Existing Tests (147 targets, unchanged)

---

## Section B — Deployment Order

```
PRE-FLIGHT CHECKS
──────────────────────────────────────────────────────────────────
 P1. [V13-FIX] Pre-flight PG version check:
     python -c "
     import asyncio
     from app.database import AsyncSessionLocal
     from sqlalchemy import text
     async def check():
         async with AsyncSessionLocal() as db:
             r = await db.execute(text('SHOW server_version_num'))
             v = int(r.scalar())
             assert v >= 110000, f'PostgreSQL {v} < 110000'
             print(f'PG version OK: {v}')
     asyncio.run(check())
     "

 P2. [V13-FIX] Pre-flight Alembic version check:
     python -c "
     from packaging.version import parse
     import alembic
     v = parse(alembic.__version__)
     assert v >= parse('1.11'), f'Alembic {v} < 1.11'
     print(f'Alembic version OK: {v}')
     "

 P3. Run full test suite → 305 green

ADDITIVE MIGRATIONS (safe — old code ignores new tables/columns)
──────────────────────────────────────────────────────────────────
  1. alembic upgrade → 006 (Notifications table + inline indexes)
  2. alembic upgrade → 007 (Recurring rules table)
  3. alembic upgrade → 007b (CONCURRENT indexes — autocommit file)
  4. alembic upgrade → 008 (Milestones table)
  5. alembic upgrade → 009 (Heatmap CONCURRENT index — autocommit file)
  6. alembic upgrade → 010 (Trajectory bonus columns)
  7. alembic upgrade → 011 (Encryption columns on daily_logs)
  8. alembic upgrade → 011b (encryption_dead_letters table + unique index)

CRON BRACKET START
──────────────────────────────────────────────────────────────────
  9. Set CRON_MAINTENANCE_MODE=true in env/ConfigMap
 10. kubectl rollout restart deployment/worker
 11. Verify:
     kubectl exec $(kubectl get pod -l app=worker --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}') \
       -- env | grep CRON_MAINTENANCE_MODE
     → must show 'true'

DEPLOY FEATURE CODE
──────────────────────────────────────────────────────────────────
 12. Deploy app image v13 with ENCRYPTION_ACTIVE=false
 13. kubectl rollout status deployment/api --timeout=300s

 14. [V13-FIX] GATE: Verify CODE_VERSION on all Running pods:
     #!/bin/bash
     set -euo pipefail
     EXPECTED=13
     PODS=$(kubectl get pods -l app=api \
       --field-selector=status.phase=Running \
       -o jsonpath='{.items[*].metadata.name}')

     for pod in $PODS; do
       if ! VERSION=$(kubectl exec "$pod" -- \
         curl -sf localhost:8000/health 2>/dev/null | \
         python3 -c "import sys,json; print(json.load(sys.stdin)['code_version'])"); then
         echo "ABORT: Failed to reach $pod"
         exit 1
       fi
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
 18. Verify: curl -sf <api>/health | python3 -c \
       "import sys,json; d=json.load(sys.stdin); assert d['encryption_active']==True"

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

     d. [V13-NEW] Post-migration sweep (catches concurrent inserts
        with small UUIDs or delayed pods):
        SELECT id FROM daily_logs
          WHERE evening_note IS NOT NULL
            AND evening_note_encrypted = FALSE;
        → Must be 0. If > 0, re-run migrate_evening_notes.py.

CRON BRACKET END
──────────────────────────────────────────────────────────────────
 21. Set CRON_MAINTENANCE_MODE=false
 22. kubectl rollout restart deployment/worker
 23. Verify: env shows 'false'
```

---

## Section C — Rollback Procedures `[V13-FIX]`

### C.1 Rollback Matrix

| Phase | Safe? | Procedure |
|-------|-------|-----------|
| Steps 1-8 (migrations only) | ✅ Yes | `alembic downgrade` per migration. Additive only. |
| Steps 9-14 (code deployed, enc=false) | ✅ Yes | Revert image. No encrypted data written. |
| Steps 15-18 (enc=true, no data migrated) | ⚠️ **Conditional** `[V13-FIX]` | **MUST run reverse migration before reverting image.** Write path sets `evening_note=None`. v12/v11 code cannot read `evening_note_ciphertext`. Procedure: (1) Set `ENCRYPTION_ACTIVE=false`, (2) `kubectl rollout restart`, (3) Run `reverse_migrate_evening_notes.py`, (4) Verify all rows decrypted, (5) Revert image. |
| Step 19 mid-migration | ⚠️ Conditional | Stop script → set `ENCRYPTION_ACTIVE=false` → restart → run reverse migration → check dead letters → revert image. |
| Step 19 completed | ⚠️ Conditional | Set `ENCRYPTION_ACTIVE=false` → restart → run reverse migration → verify → revert. |
| After Migration 012 (column drop) | ❌ **Irreversible** | NOT deployed in Sprint 6. Separate release after 2+ weeks stable. |

### C.2 Critical Rollback Invariants

```
INVARIANT 1 (I16): After ENCRYPTION_ACTIVE=true, ANY rollback to pre-v13
  code requires running reverse migration first. The write path clears
  evening_note (sets to None). Old code cannot read evening_note_ciphertext.
  Skipping reverse migration = invisible data to users.

INVARIANT 2: Env var changes require explicit kubectl rollout restart.
  Without restart, running pods keep old values. This applies to
  ENCRYPTION_ACTIVE, CRON_MAINTENANCE_MODE, and any new flag.

INVARIANT 3: Column drop (Migration 012) is NEVER in Sprint 6.
  Only after 2+ weeks stable. Irreversible.
```

> [!CAUTION]
> **V12 rollback matrix was incorrect.** It claimed Steps 15-18 were "✅ Yes" because "encrypted rows retain plaintext copies." This is false. The write path sets `evening_note=None`. V13 corrects this to "⚠️ Conditional" with mandatory reverse migration.

---

## Section D — Observability

### D.1 Metrics — Unchanged from V12, plus:

| Metric | Type | Location |
|--------|------|----------|
| `dead_letter_retry_resolved_total` `[V13]` | Counter | `resolve_dead_letters.py` |
| `dead_letter_retry_failed_total` `[V13]` | Counter | `resolve_dead_letters.py` |
| `daily_log_decrypt_failures_total` `[V13]` | Counter | `get_evening_note()` except block |
| `retention_batches_total` `[V13]` | Counter | `cleanup_old_notifications()` loop |

### D.2 Structured Log Events — Unchanged from V12, plus:

| Event | Severity | Contains |
|-------|----------|----------|
| `daily_log_decrypt_failed` `[V13]` | ERROR | `daily_log_id` |
| `daily_log_encrypted_but_null_ciphertext` `[V13]` | ERROR | `daily_log_id` |
| `dead_letter_retry_failed` `[V13]` | ERROR | `source_row_id`, `error` |
| `dead_letter_resolution_complete` `[V13]` | INFO | `resolved`, `still_failing` |
| `notification_retention_progress` `[V13]` | INFO | `batch_num`, `total_deleted_so_far` |
| `notification_retention_hit_max_batches` `[V13]` | WARN | `max_batches`, `total_deleted` |

### D.3 Alerts — Unchanged from V12, plus:

| Alert | Condition | Severity |
|-------|-----------|----------|
| DailyLogDecryptFailures `[V13]` | `daily_log_decrypt_failures_total > 0` in 5m | P2 |

### D.4 Migration Observability — Unchanged from V12

---

## Section E — Pre-Execution Checklist `[V13-FIX]`

```
Before executing Sprint 6:

PRE-FLIGHT
[ ] PostgreSQL version ≥ 11 confirmed (SHOW server_version_num >= 110000)
[ ] Alembic version ≥ 1.11 confirmed (packaging.version.parse)
[ ] ENCRYPTION_KEYS has ≥ 1 non-empty key (all validated)
[ ] ACTIVE_KEY_VERSION >= 0 AND < len(ENCRYPTION_KEYS)
[ ] 305 tests pass on staging
[ ] Python container does NOT use -O / PYTHONOPTIMIZE=1 (verify Dockerfile)

STAGING DRY-RUN
[ ] Run migrate_evening_notes.py on staging with 100 test rows
[ ] Verify dead-letter table is empty after successful migration
[ ] Inject 1 corrupt row, rerun → dead letter created
[ ] Run resolve_dead_letters.py → dead letter resolved
[ ] Run reverse_migrate_evening_notes.py → all rows decrypted

INFRASTRUCTURE
[ ] /health endpoint returns code_version and encryption_active
[ ] Pushgateway URL configured (or log-based metrics confirmed)
[ ] CronMaintenanceStuck alert configured (30 min threshold)
[ ] DeadLetterBacklog alert configured
[ ] DailyLogDecryptFailures alert configured

OPERATIONAL READINESS
[ ] Rollback procedure reviewed with on-call (Steps 15-18 = CONDITIONAL)
[ ] resolve_dead_letters.py tested on staging
[ ] Team acknowledges: column drop (012) is NOT in this release
```

---

## Section F — Key Rotation Runbook — Unchanged from V12
(now uses snapshotted version per D29)

---

## Section G — Cron Maintenance Mode Protocol — Unchanged from V12

---

## Section H — Dead-Letter Resolution Runbook `[V13-NEW]`

```
WHEN TO USE:
  Step 20c shows unresolved dead letters > 0.
  OR DeadLetterBacklog alert fires.

PROCEDURE:
  1. Inspect: SELECT * FROM encryption_dead_letters
       WHERE resolved_at IS NULL ORDER BY created_at;
     → Check error_message for patterns (KMS rate limit, bad data, etc.)

  2. Fix root cause if systemic (e.g., KMS rate limit → wait/increase quota).

  3. Retry: python scripts/resolve_dead_letters.py

  4. Verify: SELECT COUNT(*) FROM encryption_dead_letters
       WHERE resolved_at IS NULL;
     → Must be 0.

  5. If still > 0:
     → Inspect remaining rows. They have a persistent encryption problem.
     → Options:
       a. Fix the source data (manual DB update to clean null bytes, etc.)
       b. Accept data loss for those rows (mark resolved manually)
     → Document decision in incident log.

CLEANUP (after 90 days):
  DELETE FROM encryption_dead_letters
    WHERE resolved_at IS NOT NULL
      AND created_at < NOW() - INTERVAL '90 days';
```

---

## Appendix: V13 Change Log

| V12 Item | V13 Change | Trace |
|----------|------------|-------|
| `assert settings.ENCRYPTION_ACTIVE` | `if not ...: raise RuntimeError(...)` | D25, I14, M.20-M.21 |
| Rollback Steps 15-18: "✅ Yes" | "⚠️ Conditional" + mandatory reverse migration | I16, §C.1 |
| Cursor advances for errored rows → orphaned | Dead-letter tracks + `resolve_dead_letters.py` resolves | I17, D26, M.24-M.26 |
| Dead-letter `sa.insert()` in batch session | `_write_dead_letter()` uses separate `AsyncSession` | D26, I15, M.22 |
| `get_evening_note` raises on corrupt data | try/except → `"[encrypted]"` | D28, DL.3-DL.4 |
| No `resolve_dead_letters.py` | Full script provided (§5.9) | C2, M.24-M.26, §H |
| No post-migration sweep | Step 20d cursorless scan | D30, M.27 |
| PG check: `SELECT version()` string compare | `SHOW server_version_num` integer compare | M1, I.3, P1 |
| Alembic check: `__version_tuple__` | `packaging.version.parse(__version__)` | M2, I.2, P2 |
| Re-encryption reads live `ACTIVE_KEY_VERSION` | Snapshot at job start, frozen for all batches | D29, M3, 5.24 |
| Config allows `ACTIVE_KEY_VERSION=-1` | Explicit `>= 0` check | M4, 5.21-5.22 |
| Retention `IN (SELECT ... LIMIT)` no lock control | `FOR UPDATE SKIP LOCKED` + `ORDER BY id` | M5, I.10 |
| Dead-letter no unique constraint | Partial unique `uq_dead_letter_active` | M6, I.9 |
| `_parse_version_prefix` value[:8] limit | Regex `^v(\d+):(.+)$` — no slice | M7, 5.20 |
| No dead-letter retention policy | 90-day cleanup in runbook | §H |
| Health gate no error handling | `set -euo pipefail` + `--field-selector=status.phase=Running` | M8 |
| Retention no max iterations | `MAX_BATCHES = 10_000` + progress logging | M9, I.11 |
| No `PYTHONOPTIMIZE` Dockerfile check | Added to pre-execution checklist | §E |
