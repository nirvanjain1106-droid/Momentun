# Sprint 6 — Tests, Deployment & Rollback (Revision 17)

> Part 2 of 2. See `sprint6_v17_plan_part1.md` for code fixes.

---

## A. New Test Targets (V17 additions)

| # | Test | Proves | Regression Guard |
|---|------|--------|------------------|
| T.36 | `test_health_endpoint_zero_db_queries` — After startup, call `/health` 100x. Assert 0 DB queries via query counter middleware. | B1 | Startup cache works |
| T.37 | `test_health_endpoint_lazy_retry_on_startup_failure` — Block DB at startup. Call `/health`. Assert `encryption_columns_present=false`. Unblock DB. Call `/health` again. Assert `true`. | B1 | Lazy retry doesn't break on DB-down boot |
| T.38 | `test_reencrypt_cursor_advances_on_occ_skip` — Force `rowcount=0`. Assert cursor advances. Assert `reencrypt_occ_skip` logged. Run again. Assert no infinite loop (batch empty). | B2 | Cursor advances, no stall |
| T.39 | `test_reverse_cursor_advances_on_occ_skip` — Same as T.38 for reverse migration. | B2/M4 | Same pattern |
| T.40 | `test_resolve_dl_encrypt_auto_cleared_during_rollback` — Insert `encrypt` DL. `ENCRYPTION_ACTIVE=false`. Run `resolve_dead_letters()` with no filter. Assert DL resolved. Assert row stays plaintext. | B3 | No re-encryption during rollback |
| T.41 | `test_resolve_dl_mixed_batch_rollback` — Insert `encrypt` + `decrypt` + `reencrypt` DLs. `ENCRYPTION_ACTIVE=false`. Run without filter. Assert: encrypt auto-cleared, decrypt resolved to plaintext, reencrypt resolved to plaintext. | B3 | All 3 ops correct during rollback |
| T.42 | `test_resolve_dl_encrypt_works_during_normal_ops` — `ENCRYPTION_ACTIVE=true`. Insert `encrypt` DL. Run. Assert row encrypted. | B3 regression | Guard doesn't block normal ops |
| T.43 | `test_smoke_test_passes_on_empty_string` — Encrypted empty string. Assert smoke test logic does NOT fail. | B4 | No false abort on empty |
| T.44 | `test_smoke_test_passes_on_null_evening_note` — Encrypted row where original was null. Assert smoke test skips or passes. | B4 | No false abort on null |
| T.45 | `test_migration_exit_emits_structured_json` — Run migration. Assert stdout contains valid JSON with `encryption_migration_exit` event. | M1 | Log-based alerting works |
| T.46 | `test_dl_failure_counter_survives_intermittent_success` — Pattern: DL-fail, row-success, DL-fail, row-success, DL-fail. Assert abort after 3rd DL failure within batch. | M2 | Counter not defeated by intermittent success |
| T.47 | `test_dl_failure_counter_resets_between_batches` — Batch 1: 2 DL failures. Batch 2: 1 DL failure. Assert no abort (each batch < 3). | M2 regression | Doesn't over-trigger across batches |
| T.48 | `test_resolve_reencrypt_uses_snapshot_version` — Change `ACTIVE_KEY_VERSION` mid-resolution. Assert all rows use original version. | M3 | No config drift |

**Updated total test targets: 366** (353 from V16 + 13 new V17 tests)

---

## B. Deployment Order `[V17-UPDATED]`

### Step 14 — Health Gate

```bash
#!/bin/bash
set -euo pipefail

# V17: Unchanged from V16 except code_version check
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

### Step 20e — Smoke Test `[V17-FIX]`

```bash
# V17-FIX (B4): Only rejects [encrypted] placeholder and HTTP errors.
# Does NOT reject null, empty, or nested payloads.
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

  # Check for the specific failure marker — raw placeholder leak
  LEAKED=$(kubectl exec deploy/api -c api -- \
    cat /tmp/smoke.json | jq -r '
      (.evening_note // .data.evening_note // "CHECK_NESTED")
    ')

  if [ "$LEAKED" = "[encrypted]" ]; then
    echo "FAIL: Raw encrypted placeholder leaked for row $TEST_ID"
    exit 1
  fi

  echo "PASS: Smoke test OK for row $TEST_ID (HTTP 200, no placeholder leak)"
fi
```

---

## C. Rollback Matrix

| Phase | Safe? | V17 Notes |
|-------|-------|-----------|
| **Before Migration (1-14)** | ✅ Yes | Health endpoint no longer queries DB per probe. Gate stable. |
| **Mid-Migration (Step 19)** | ✅ Yes | DL abort at 3/batch. Cursor advances on OCC skip. No stalls. |
| **After Migration (Step 20)** | ✅ Yes | Smoke test no longer false-aborts on null/empty. |
| **Day 3+ Rollback** | ✅ Yes | **V17-FIX**: `encrypt` DLs auto-cleared. `reencrypt` DLs decrypt to plaintext. No re-encryption during rollback. |
| **Key Rotation** | ⚠️ Conditional | `ENCRYPTION_KEYS` append-only. Operator discipline. |

### Day 3+ Rollback Checklist `[V17-FIX]`

```bash
# 1-3: Unchanged from V16 (pause crons, disable encryption, reverse migrate)

# 4. Resolve remaining dead letters
# V17-FIX: Safe to run without filter — encrypt DLs auto-cleared (D39)
kubectl exec deploy/api -c api -- python -m scripts.resolve_dead_letters

# 5. V17: Verify ALL unresolved DLs = 0
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
  echo "ERROR: Unresolved dead letters remain. Investigate before proceeding."
  exit 1
fi
echo "Note: encrypt DLs were auto-cleared (row stays plaintext)."
echo "      reencrypt DLs were decrypted to plaintext."
echo "      decrypt DLs were processed normally."

# 6. Verify + resume (unchanged from V16)
```

---

## D. Observability `[V17-UPDATED]`

### D.1 Metrics

| Metric | Type | Location | Scrape Strategy |
|--------|------|----------|-----------------|
| `dead_letter_write_failures_total` | Counter | `_write_dead_letter` | In-process (long-lived API) |
| `daily_log_decrypt_failures` | Counter | `get_evening_note` | In-process |
| `encryption_migration_rows_total` | Counter | `migrate_evening_notes` | **V17: Structured JSON log at exit** |
| `encryption_migration_errors_total` | Counter | `migrate_evening_notes` | **V17: Structured JSON log at exit** |
| `dead_letter_resolution_batch_total` | Counter | `resolve_dead_letters` | **V17: Structured JSON log at exit** |

### D.2 Alerts

| Alert | Condition | Type |
|-------|-----------|------|
| `EncryptionMigrationStalled` | 0 rows in 15 min | Log-based (exit JSON) |
| `DeadLetterBacklog` | Unresolved > 100 for 1h | SQL query (cron) |
| `DeadLetterWriteFailure` | `increase(dead_letter_write_failures_total[1m]) >= 3` | **V17-FIX (m1): PromQL metric-based** |
| `CircuitBreakerTripped` | `encryption_migration_errors_total` spike | Log-based (exit JSON) |

---

## E. Pre-Execution Checklist `[V17-UPDATED]`

- [ ] Product sign-off on DST "fire early" behavior
- [ ] `/health` returns cached `encryption_columns_present` (no per-request DB query) (**V17**)
- [ ] Health gate checks `code_version == 17`
- [ ] Smoke test does NOT fail on null/empty evening notes (**V17**)
- [ ] `resolve_dead_letters` auto-clears `encrypt` DLs when `ENCRYPTION_ACTIVE=false` (**V17**)
- [ ] Re-encrypt/reverse cursors advance on OCC skip (**V17**)
- [ ] `consecutive_dl_failures` resets at batch boundary only (**V17**)
- [ ] `_resolve_reencrypt` uses snapshotted `target_version` (**V17**)
- [ ] Scripts emit structured JSON exit logs (**V17**)
- [ ] `DLPoolUnavailable` alert uses PromQL, not logs (**V17**)
- [ ] All 5 in-process metrics wired
- [ ] Label selector standardized to `app=api`
- [ ] 366 tests pass
- [ ] Staging dry-run with all steps

---

## F. "Looks Safe But Isn't" — V17 Resolution

| V16 Claim | V16 Status | V17 Resolution |
|-----------|------------|----------------|
| Health endpoint robust | ❌ DB query per probe | ✅ Startup cache + lazy retry. Zero DB queries at runtime. |
| Re-encrypt cursor after commit | ❌ Stalls on OCC skip | ✅ Cursor advances on `rowcount=0` with warning log. |
| DL resolution safe during rollback | ❌ Guard bypassed with no filter | ✅ Per-row guard auto-clears `encrypt` DLs. No re-encryption. |
| Smoke test verifies decrypt | ❌ False abort on empty/null | ✅ Only checks HTTP 200 + rejects `[encrypted]`. |
| Metrics all wired | ⚠️ Ephemeral scripts | ✅ Structured JSON exit logs for log-based alerting. |
| DL failure abort at 3 | ⚠️ Defeated by intermittent success | ✅ Counter resets at batch boundary, not per-row. |
| `DLPoolUnavailable` alert | ⚠️ Log-based | ✅ PromQL: `increase(dead_letter_write_failures_total[1m]) >= 3` |

## G. Outstanding Items (Non-Blocking)

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
