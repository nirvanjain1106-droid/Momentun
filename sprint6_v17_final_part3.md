# Sprint 6 — Tests, Deployment & Rollback (Revision 17 — Final)

> **Self-contained document.** Part 3 of 3. No external revision references required.
> All test targets, deployment scripts, rollback procedures, and observability are fully specified here.

---

## 1. Test Targets — V17 Additions

| # | Test | Proves | Regression Guard |
|---|------|--------|------------------|
| T.36 | `test_health_endpoint_zero_db_queries` — After startup, call `/health` 100×. Assert 0 DB queries via query counter middleware. | B1 | Startup cache works |
| T.37 | `test_health_endpoint_lazy_retry_on_startup_failure` — Block DB at startup. Call `/health`. Assert `encryption_columns_present=false`. Unblock DB. Call `/health` again. Assert `true`. | B1 | Lazy retry on DB-down boot |
| T.38 | `test_reencrypt_cursor_advances_on_occ_skip` — Force `rowcount=0`. Assert cursor advances. Assert `reencrypt_occ_skip` logged. Run again. Assert no infinite loop (batch empty). | B2 | Cursor advances, no stall |
| T.39 | `test_reverse_cursor_advances_on_occ_skip` — Same as T.38 for reverse migration. | B2 | Same pattern |
| T.40 | `test_resolve_dl_encrypt_auto_cleared_during_rollback` — Insert `encrypt` DL. `ENCRYPTION_ACTIVE=false`. Run `resolve_dead_letters()` with no filter. Assert DL resolved. Assert row stays plaintext. | B3 | No re-encryption during rollback |
| T.41 | `test_resolve_dl_mixed_batch_rollback` — Insert `encrypt` + `decrypt` + `reencrypt` DLs. `ENCRYPTION_ACTIVE=false`. Run without filter. Assert: encrypt auto-cleared, decrypt resolved to plaintext, reencrypt resolved to plaintext. | B3 | All 3 ops correct during rollback |
| T.42 | `test_resolve_dl_encrypt_works_during_normal_ops` — `ENCRYPTION_ACTIVE=true`. Insert `encrypt` DL. Run. Assert row encrypted. | B3 | Guard doesn't block normal ops |
| T.43 | `test_smoke_test_passes_on_empty_string` — Encrypted empty string. Assert smoke test logic does NOT fail. | B4 | No false abort on empty |
| T.44 | `test_smoke_test_passes_on_null_evening_note` — Encrypted row where original was null. Assert smoke test skips or passes. | B4 | No false abort on null |
| T.45 | `test_migration_exit_emits_structured_json` — Run migration. Assert stdout contains valid JSON with `encryption_migration_exit` event. | M1 | Log-based alerting works |
| T.46 | `test_dl_failure_counter_survives_intermittent_success` — Pattern: DL-fail, row-success, DL-fail, row-success, DL-fail. Assert abort after 3rd DL failure within batch. | M2 | Counter not defeated by intermittent success |
| T.47 | `test_dl_failure_counter_resets_between_batches` — Batch 1: 2 DL failures. Batch 2: 1 DL failure. Assert no abort (each batch < 3). | M2 | Doesn't over-trigger across batches |
| T.48 | `test_resolve_reencrypt_uses_snapshot_version` — Change `ACTIVE_KEY_VERSION` mid-resolution. Assert all rows use original version. | M3 | No config drift |
| T.49 | `test_migration_graceful_shutdown_on_sigterm` — Send SIGTERM mid-batch. Assert cursor checkpoint written via `migration_batch_complete` log. Assert `migration_exit_summary` emitted before process exit. | Heartbeat | Graceful shutdown emits state |
| T.50 | `test_decrypt_unknown_version_creates_dl` — Encrypt row with version N. Remove key N from `ENCRYPTION_KEYS`. Run forward migration or `resolve_dead_letters`. Assert DL created with `Invalid key version` error. Assert row not silently dropped. | Key safety | Unknown versions → DL, not silent loss |

**Updated total test targets: 368** (353 from V16 + 15 new V17 tests)

---

## 2. Deployment Order — Full Step Sequence

| Step | Action | Gate |
|------|--------|------|
| 1 | Tag release `v6.0-rc1` | — |
| 1b | **Pre-flight nullable check** (see §2.0) | `evening_note` is nullable |
| 2 | Deploy Migration 011 (add columns) | Alembic success |
| 3 | Deploy Migration 011b (dead-letter table) | Alembic success |
| 4 | Deploy app code with `ENCRYPTION_ACTIVE=false` | All pods healthy |
| 5–13 | Standard app verification (existing tests, API probes) | 368 tests green |
| **14** | **Health gate** (see §2.1) | All pods v17 + columns present |
| 15 | Set `ENCRYPTION_ACTIVE=true`, `CRON_MAINTENANCE_MODE=true` | Pod restart complete |
| 16–18 | Verify write path encrypts new rows | Manual insert + read |
| **19** | **Run forward migration** (`migrate_evening_notes.py`) | Exit summary: 0 errors |
| **20a** | Verify 0 plaintext remaining | SQL count check |
| **20b** | Verify dead-letter backlog | 0 unresolved or all resolved |
| **20c** | Run `resolve_dead_letters.py` if needed | Exit summary: 0 errors |
| **20d** | Post-migration sweep (D30) | 0 plaintext rows |
| **20e** | **Smoke test** (see §2.2) | HTTP 200, no placeholder leak |
| 21 | Set `CRON_MAINTENANCE_MODE=false` | — |
| 22 | Monitor for 24h | Alerts silent |

### 2.0 Step 1b — Pre-Flight Nullable Check

```bash
# Verify evening_note is nullable BEFORE running migrations.
# Early warning if constraint exists — operator can investigate before proceeding.
echo "=== Step 1b: Pre-flight nullable check ==="

IS_NULLABLE=$(kubectl exec deploy/api -c api -- psql -tA -c \
  "SELECT is_nullable FROM information_schema.columns \
   WHERE table_name='daily_logs' AND column_name='evening_note';")

echo "evening_note.is_nullable = $IS_NULLABLE"
if [ "$IS_NULLABLE" = "NO" ]; then
  echo "WARNING: evening_note has NOT NULL constraint."
  echo "Migration 011 will drop it conditionally, but verify this is expected."
fi
```

### 2.1 Step 14 — Health Gate

```bash
#!/bin/bash
set -euo pipefail

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
  echo "ABORT: No ready, non-terminating pods found"
  exit 1
fi

for pod in $PODS; do
  HEALTH=$(kubectl exec "$pod" -c api -- \
    curl -sf http://localhost:8000/health || echo '{}')

  VERSION=$(echo "$HEALTH" | jq -r '.code_version // "unknown"')
  HAS_COLS=$(echo "$HEALTH" | jq -r '.encryption_columns_present // false')

  if [ "$VERSION" != "17" ]; then
    echo "ABORT: $pod version=$VERSION, expected 17"
    exit 1
  fi
  if [ "$HAS_COLS" != "true" ]; then
    echo "ABORT: $pod missing encryption columns"
    exit 1
  fi
  echo "OK: $pod → v$VERSION, columns=$HAS_COLS"
done
echo "=== Health gate passed ==="
```

### 2.2 Step 20e — Smoke Test

```bash
echo "=== Step 20e: API Smoke Test ==="

TEST_ID=$(kubectl exec deploy/api -c api -- python -c "
from sqlalchemy import create_engine, text
from app.config import settings
e = create_engine(settings.DATABASE_URL.replace('+asyncpg', ''))
with e.connect() as c:
    r = c.execute(text(
        'SELECT id FROM daily_logs '
        'WHERE evening_note_encrypted = true '
        'AND evening_note_ciphertext IS NOT NULL '
        'LIMIT 1'
    )).fetchone()
    print(r[0] if r else '')
")

if [ -z "$TEST_ID" ]; then
  echo "SKIP: No encrypted rows with ciphertext to smoke test."
else
  HTTP_CODE=$(kubectl exec deploy/api -c api -- \
    curl -s -o /tmp/smoke.json -w "%{http_code}" \
    "http://localhost:8000/api/v1/daily-logs/$TEST_ID")

  if [ "$HTTP_CODE" != "200" ]; then
    echo "FAIL: HTTP $HTTP_CODE on encrypted row $TEST_ID"
    exit 1
  fi

  # D38: Only rejects [encrypted] placeholder and HTTP errors.
  # Does NOT reject null, empty, or nested payloads.
  SMOKE_VALUE=$(kubectl exec deploy/api -c api -- \
    cat /tmp/smoke.json | jq -r '
      (.evening_note // .data.evening_note // "CHECK_NESTED")
    ')

  if [ "$SMOKE_VALUE" = "[encrypted]" ]; then
    echo "FAIL: Raw encrypted placeholder leaked for row $TEST_ID"
    exit 1
  fi

  echo "PASS: Smoke test OK for row $TEST_ID (HTTP 200, no placeholder leak)"
fi
```

### 2.3 Step 20d — Post-Migration Sweep

```bash
echo "=== Step 20d: Post-Migration Sweep (D30) ==="

REMAINING=$(kubectl exec deploy/api -c api -- python -c "
from sqlalchemy import create_engine, text
from app.config import settings
e = create_engine(settings.DATABASE_URL.replace('+asyncpg', ''))
with e.connect() as c:
    r = c.execute(text(
        'SELECT COUNT(*) FROM daily_logs '
        'WHERE evening_note_encrypted = false '
        'AND evening_note IS NOT NULL'
    )).scalar()
    print(r)
")

if [ "$REMAINING" != "0" ]; then
  echo "WARNING: $REMAINING plaintext rows remain after migration."
  echo "Likely cause: concurrent inserts from delayed pods."
  echo "Action: Re-run migrate_evening_notes.py or investigate."
  exit 1
fi
echo "PASS: 0 plaintext rows remaining."
```

---

## 3. Rollback Matrix

| Phase | Safe? | Procedure | V17 Notes |
|-------|-------|-----------|-----------|
| **Before Migration (Steps 1–14)** | ✅ Yes | `kubectl rollout undo`. Schema additive. | Health endpoint no longer queries DB per probe. Gate stable. |
| **Mid-Migration (Step 19)** | ✅ Yes | Kill script. Run reverse migration. | DL abort at 3/batch. Cursor advances on OCC skip. No stalls. |
| **After Migration (Step 20)** | ✅ Yes | `ENCRYPTION_ACTIVE=false`, reverse migrate. | Smoke test no longer false-aborts on null/empty. |
| **Day 3+ Rollback** | ✅ Yes | Full checklist below. | `encrypt` DLs auto-cleared. `reencrypt` DLs decrypt to plaintext. No re-encryption during rollback. |
| **Key Rotation** | ⚠️ Conditional | `ENCRYPTION_KEYS` append-only. | Operator discipline. CI enforcement post-Sprint 6. |

### 3.1 Day 3+ Rollback Checklist

```bash
# ── Step 1: Pause crons ──
kubectl set env deploy/api CRON_MAINTENANCE_MODE=true
kubectl rollout restart deploy/api && kubectl rollout status deploy/api

# ── Step 2: Disable encryption ──
kubectl set env deploy/api ENCRYPTION_ACTIVE=false
kubectl rollout restart deploy/api && kubectl rollout status deploy/api

# ── Step 3: Run reverse migration ──
kubectl exec deploy/api -c api -- \
  python -m scripts.reverse_migrate_evening_notes
REVERSE_EXIT=$?

# ── Step 3b: Verify reverse migration exit ──
if [ "$REVERSE_EXIT" -ne 0 ]; then
  echo "ABORT: Reverse migration exited with code $REVERSE_EXIT"
  echo "DL abort threshold or circuit breaker triggered."
  echo "Investigate logs before proceeding to DL resolution."
  exit 1
fi
echo "OK: Reverse migration completed (exit 0)."

# ── Step 4: Resolve remaining dead letters ──
# Safe to run without filter — encrypt DLs auto-cleared (D39)
kubectl exec deploy/api -c api -- python -m scripts.resolve_dead_letters
RESOLVE_EXIT=$?
if [ "$RESOLVE_EXIT" -ne 0 ]; then
  echo "WARNING: DL resolution exited with code $RESOLVE_EXIT"
fi

# ── Step 5: Verify ALL unresolved DLs = 0 ──
ALL_DL=$(kubectl exec deploy/api -c api -- python -c "
from sqlalchemy import create_engine, text
from app.config import settings
e = create_engine(settings.DATABASE_URL.replace('+asyncpg', ''))
with e.connect() as c:
    r = c.execute(text(
        \"SELECT operation, COUNT(*) FROM encryption_dead_letters \"
        \"WHERE source_table = 'daily_logs' AND resolved_at IS NULL \"
        \"GROUP BY operation\"
    )).fetchall()
    for op, cnt in r:
        print(f'{op}: {cnt}')
    if not r:
        print('CLEAN')
")
echo "Unresolved DLs: $ALL_DL"
if echo "$ALL_DL" | grep -qv "CLEAN"; then
  echo "ERROR: Unresolved dead letters remain."
  echo "ESCALATION: If still_failing > 0 after 2 resolution attempts:"
  echo "  1. Check DL table: SELECT * FROM encryption_dead_letters WHERE resolved_at IS NULL;"
  echo "  2. If errors are key-version related: verify ENCRYPTION_KEYS contains all historical keys."
  echo "  3. If errors are data corruption: manually inspect affected rows and resolve or accept data loss."
  echo "  4. Page on-call SRE if > 50 unresolved after 3 attempts."
  exit 1
fi
echo "Note: encrypt DLs were auto-cleared (row stays plaintext)."
echo "      reencrypt DLs were decrypted to plaintext."
echo "      decrypt DLs were processed normally."

# ── Step 6: Verify plaintext restoration ──
ENCRYPTED_LEFT=$(kubectl exec deploy/api -c api -- python -c "
from sqlalchemy import create_engine, text
from app.config import settings
e = create_engine(settings.DATABASE_URL.replace('+asyncpg', ''))
with e.connect() as c:
    r = c.execute(text(
        'SELECT COUNT(*) FROM daily_logs WHERE evening_note_encrypted = true'
    )).scalar()
    print(r)
")
echo "Rows still encrypted: $ENCRYPTED_LEFT"
if [ "$ENCRYPTED_LEFT" != "0" ]; then
  echo "ERROR: $ENCRYPTED_LEFT rows still encrypted after rollback."
  exit 1
fi

# ── Step 7: Resume crons ──
kubectl set env deploy/api CRON_MAINTENANCE_MODE=false
kubectl rollout restart deploy/api
echo "=== Day 3+ rollback complete ==="
```

---

## 4. Observability

### 4.1 Metrics

| Metric | Type | Location | Scrape Strategy |
|--------|------|----------|-----------------|
| `daily_log_decrypt_failures` | Counter | `get_evening_note` | In-process (long-lived API) — Prometheus scrapes |
| `encryption_migration_rows_total` | — | `migrate_evening_notes` | Structured JSON log at exit (D40) |
| `encryption_migration_errors_total` | — | `migrate_evening_notes` | Structured JSON log at exit (D40) |
| `dead_letter_resolution_batch_total` | — | `resolve_dead_letters` | Structured JSON log at exit (D40) |
| `dead_letter_write_failure_counted` | — | `_write_dead_letter` | Structured log per event + exit log `total_dl_failures` |

> **Note:** `dead_letter_write_failures_total` Prometheus counter was removed from `_dl_utils.py`. Ephemeral scripts exit before Prometheus scrapes. DL write failures are tracked via structured logs and the `total_dl_failures` field in each script's exit summary.

### 4.2 Alerts

| Alert | Condition | Type |
|-------|-----------|------|
| `EncryptionMigrationStalled` | No `migration_batch_complete` OR `migration_exit_summary` log in 15 min | Log-based (heartbeat + exit JSON) |
| `DeadLetterBacklog` | Unresolved > 100 for 1h | SQL query (cron) |
| `DeadLetterWriteFailure` | `total_dl_failures > 0` in batch-complete or exit-summary logs | Log-based (structured JSON) |
| `CircuitBreakerTripped` | `migration_exit_summary` with non-zero exit or `total_errors` spike | Log-based (exit JSON) |

### 4.3 Structured Exit Log Formats (D40)

All migration/resolution scripts emit a JSON summary in a `finally` block. Each script's schema:

**Forward migration** (`migrate_evening_notes`):
```json
{
  "script": "migrate_evening_notes",
  "total_encrypted": 12345,
  "total_skipped": 3,
  "total_errors": 0,
  "total_dl_failures": 0,
  "batches": 25,
  "final_cursor_ts": "2026-04-27T00:00:00+00:00",
  "final_cursor_id": "abc123..."
}
```

**Reverse migration** (`reverse_migrate_evening_notes`):
```json
{
  "script": "reverse_migrate_evening_notes",
  "total_decrypted": 12345,
  "total_skipped": 3,
  "total_errors": 0,
  "total_dl_failures": 0,
  "batches": 25,
  "final_cursor_ts": "2026-04-27T00:00:00+00:00",
  "final_cursor_id": "abc123..."
}
```

**Re-encryption** (`reencrypt_evening_notes`):
```json
{
  "script": "reencrypt_evening_notes",
  "target_version": 1,
  "total_reencrypted": 12345,
  "total_skipped": 3,
  "total_errors": 0,
  "total_dl_failures": 0,
  "batches": 25,
  "final_cursor_ts": "2026-04-27T00:00:00+00:00",
  "final_cursor_id": "abc123..."
}
```

**Dead-letter resolution** (`resolve_dead_letters`):
```json
{
  "script": "resolve_dead_letters",
  "operation_filter": null,
  "target_version": 0,
  "total_resolved": 5,
  "total_errors": 0,
  "batches": 1
}
```

Log-based alerts parse `script` + `total_errors` + `total_dl_failures` fields. Batch-level `migration_batch_complete` logs serve as heartbeat signals for stall detection. Pushgateway optional (not a hard dependency).

---

## 5. Pre-Execution Checklist

- [ ] Product sign-off on DST "fire early" behavior
- [ ] `/health` returns cached `encryption_columns_present` (no per-request DB query)
- [ ] Health gate checks `code_version == 17`
- [ ] Smoke test does NOT fail on null/empty evening notes
- [ ] `resolve_dead_letters` auto-clears `encrypt` DLs when `ENCRYPTION_ACTIVE=false`
- [ ] Re-encrypt/reverse cursors advance on OCC skip
- [ ] `consecutive_dl_failures` resets at batch boundary only
- [ ] `_resolve_reencrypt` uses snapshotted `target_version`
- [ ] Scripts emit structured JSON exit logs
- [ ] `DeadLetterWriteFailure` alert uses structured log parsing
- [ ] `daily_log_decrypt_failures` counter wired in long-lived API process
- [ ] DL write failures tracked via structured logs (no ephemeral Prometheus counters)
- [ ] Label selector standardized to `app=api`
- [ ] 368 tests pass
- [ ] Staging dry-run with all steps (1 through 22)

---

## 6. Regression Guard Summary

Every V17 fix was validated against these anti-regression rules:

| Fix | Could Introduce | Guard |
|-----|-----------------|-------|
| B1: Startup cache health | Pod fails to boot if DB down | `_encryption_columns_present = None` default; lazy retry on first `/health` call |
| B2: OCC cursor advance | Skips rows that need work | OCC skip = row concurrently modified → already at different state. Safe to advance. |
| B3: Per-row encrypt guard | Blocks legitimate encrypt resolution | Guard only fires when `ENCRYPTION_ACTIVE=false`. During normal ops, encrypt DLs resolve normally. |
| B4: Smoke test relaxed | Misses real decrypt failures | Still checks HTTP 200 + rejects `[encrypted]` placeholder. Only removes false-positive on null/empty. |
| M1: Structured exit log | Adds import at exit | `import json` is stdlib, zero-dep. `finally` block guarantees execution. |
| M2: Batch-boundary DL reset | Misses cross-batch DL outage | Counter persists across rows within batch. Only resets between batches. Sustained outage hits threshold. |
| M3: Snapshot key version | Stale version during long run | Resolution scripts are short-lived. Key rotation requires maintenance mode. No concurrent version changes. |

---

## 7. "Looks Safe But Isn't" — V17 Resolution

| V16 Claim | V16 Status | V17 Resolution |
|-----------|------------|----------------|
| Health endpoint robust | ❌ DB query per probe | ✅ Startup cache + lazy retry. Zero DB queries at runtime. |
| Re-encrypt cursor after commit | ❌ Stalls on OCC skip | ✅ Cursor advances on `rowcount=0` with warning log. |
| DL resolution safe during rollback | ❌ Guard bypassed with no filter | ✅ Per-row guard auto-clears `encrypt` DLs. No re-encryption. |
| Smoke test verifies decrypt | ❌ False abort on empty/null | ✅ Only checks HTTP 200 + rejects `[encrypted]`. |
| Metrics all wired | ⚠️ Ephemeral scripts | ✅ Structured JSON exit logs for log-based alerting. |
| DL failure abort at 3 | ⚠️ Defeated by intermittent success | ✅ Counter resets at batch boundary, not per-row. |
| `DLPoolUnavailable` alert | ⚠️ Log-based | ✅ Structured log parsing for `dead_letter_write_failure_counted` events + exit log `total_dl_failures` field |

---

## 8. Outstanding Items (Non-Blocking)

| Item | Status |
|------|--------|
| `preStop` cron drain | Accepted — sweep handles stragglers |
| `ENCRYPTION_KEYS` append-only | Documented — CI enforcement post-Sprint 6 |
| DST "fire early" | Awaiting product sign-off |
| Empty string encryption | Documented — round-trips correctly |
| DL retention cron | Post-Sprint 6 |
| Migration 011b idempotency | Verify with migrations lead |
| `resolve_dead_letters` O(n²) on repeat runs | Document `--since` flag post-Sprint 6 |
| Transaction isolation level | `READ COMMITTED` default is correct for OCC pattern |
| Vacuum bloat on high-churn tables | Standard PG maintenance; not Sprint 6 scope |

---

## 9. Document Map

| Part | File | Contents |
|------|------|----------|
| 1 | `sprint6_v17_final_part1.md` | Invariants (I1–I25), Decisions (D1–D40), Schema, Encryption module, Config, DL pool, Write/Read path, Health endpoint, Notification retention, DST behavior |
| 2 | `sprint6_v17_final_part2.md` | `_write_dead_letter`, `migrate_evening_notes`, `reverse_migrate_evening_notes`, `reencrypt_evening_notes`, `resolve_dead_letters`, Script cross-reference |
| 3 | `sprint6_v17_final_part3.md` | Test targets (T.36–T.48), Deployment steps (1–22), Health gate, Smoke test, Post-migration sweep, Rollback matrix, Day 3+ checklist, Observability, Pre-execution checklist, Regression guards, Outstanding items |
