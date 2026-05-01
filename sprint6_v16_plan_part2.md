# Sprint 6 — Tests, Deployment & Rollback (Revision 16)

> Part 2 of 2. See `sprint6_v16_plan_part1.md` for code fixes.

---

## A. New/Updated Test Targets (V16 additions)

| # | Test | Proves |
|---|------|--------|
| T.19 | `test_health_endpoint_returns_encryption_columns_present` — Assert `/health` response contains `encryption_columns_present` and `code_version` keys. | B1 (D37) |
| T.20 | `test_health_gate_keys_match_endpoint_schema` — Parse gate script `jq` keys. Assert each key exists in `/health` response schema. | B1 (D37) |
| T.21 | `test_health_gate_aborts_on_empty_pods` — Simulate empty pod list. Assert gate exits 1. | B1 (R2-C1) |
| T.22 | `test_health_gate_filters_terminating_pods` — Pod with `deletionTimestamp != null`. Assert excluded. | B1 (R2-C1) |
| T.23 | `test_smoke_test_rejects_null_evening_note` — Row with `evening_note IS NULL`. Assert test skips or selects different row. | B2 (D38) |
| T.24 | `test_smoke_test_rejects_encrypted_placeholder` — API returns `"[encrypted]"`. Assert test fails. | B2 |
| T.25 | `test_reencrypt_cursor_after_commit_only` — SIGKILL between loop and commit. Assert cursor at pre-batch position. | B3 |
| T.26 | `test_reencrypt_cursor_holds_on_dl_failure` — Mock `_write_dead_letter` → `False`. Assert cursor does not advance past failed row. | B3 |
| T.27 | `test_encryption_migration_rows_counter` — Run migration on 5 rows. Assert `encryption_migration_rows_total` == 5. | B4 |
| T.28 | `test_encryption_migration_errors_counter` — Force 2 failures. Assert `encryption_migration_errors_total` == 2. | B4 |
| T.29 | `test_dl_resolution_batch_counter` — Resolve 2 batches. Assert `dead_letter_resolution_batch_total` == 2. | B4 |
| T.30 | `test_day3_rollback_checks_all_dl_operations` — Insert DLs with `encrypt` + `decrypt` ops. Assert rollback check catches both. | M1 |
| T.31 | `test_resolve_dl_reencrypt_during_rollback` — Set `ENCRYPTION_ACTIVE=false`. Run resolve with `reencrypt` DLs. Assert rows decrypted to plaintext. | M2 (D39) |
| T.32 | `test_resolve_dl_encrypt_blocked_during_rollback` — Set `ENCRYPTION_ACTIVE=false`. Run resolve with `encrypt` filter. Assert `RuntimeError`. | M2 (D39) |
| T.33 | `test_migration_aborts_on_3_consecutive_dl_failures` — Mock DL write to always fail. Assert `RuntimeError` after 3 DL failures. | M3 (I25) |
| T.34 | `test_occ_skip_logs_warning` — Force OCC collision. Assert `encryption_migration_occ_skip` log emitted. | M5 |
| T.35 | `test_resolve_decrypt_rowcount_check` — Force OCC skip in decrypt handler. Assert DL still resolved with warning log. | M6 |

**Updated total test targets: 353** (336 from V15 + 17 new V16 tests)

---

## B. Deployment Order `[V16-UPDATED]`

### Step 14 — Health Gate `[V16-FIX]`

```bash
#!/bin/bash
set -euo pipefail

# V16-FIX (B1, D37): Restored V14 structure + V15 fixes
# - Checks encryption_columns_present AND code_version
# - Empty pod guard
# - deletionTimestamp filter
# - Standardized label: app=api
# - Container selector: -c api

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
  ENC_ACTIVE=$(echo "$HEALTH" | jq -r '.encryption_active // false')

  if [ "$VERSION" != "16" ]; then
    echo "ABORT: $pod version=$VERSION, expected 16"
    exit 1
  fi
  if [ "$HAS_COLS" != "true" ]; then
    echo "ABORT: $pod missing encryption columns"
    exit 1
  fi
  echo "OK: $pod → v$VERSION, columns=$HAS_COLS, encryption=$ENC_ACTIVE"
done

echo "=== Health gate passed ==="
```

### Step 20e — API Smoke Test `[V16-FIX]`

```bash
# V16-FIX (B2, D38): Proper null handling + HTTP status check
echo "=== Step 20e: API Smoke Test ==="

# Select a row that ACTUALLY has encrypted content (not null)
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

  RESULT=$(kubectl exec deploy/api -c api -- \
    cat /tmp/smoke.json | jq -r '.evening_note // empty')

  if [ -z "$RESULT" ]; then
    echo "FAIL: evening_note is null/empty for encrypted row $TEST_ID"
    exit 1
  fi

  if [ "$RESULT" = "[encrypted]" ]; then
    echo "FAIL: Raw encrypted placeholder leaked for row $TEST_ID"
    exit 1
  fi

  echo "PASS: Smoke test decrypted row $TEST_ID successfully"
fi
```

---

## C. Rollback Matrix `[V16-UPDATED]`

| Phase | Safe? | Procedure | V16 Notes |
|-------|-------|-----------|-----------|
| **Before Migration (1-14)** | ✅ Yes | `kubectl rollout undo`. Schema additive. | V16: Health gate now matches `/health` payload. |
| **Mid-Migration (Step 19)** | ✅ Yes | Kill script. Run reverse migration. | V16: DL abort after 3 failures (I25) prevents silent loss. |
| **After Migration (Step 20)** | ✅ Yes | `ENCRYPTION_ACTIVE=false`, `CRON_MAINTENANCE_MODE=true`. Reverse migrate. | V16: Smoke test now validates actual decryption. |
| **Day 3+ Rollback** | ✅ Yes | Same as "After Migration" + full DL verification. | **V16-FIX (M1)**: Checks ALL DL operations, not just decrypt. |
| **Key Rotation** | ⚠️ Conditional | `ENCRYPTION_KEYS` append-only. | Unchanged. Operator discipline. |

### Day 3+ Rollback Checklist `[V16-FIX]`

```bash
# 1. Pause crons
kubectl set env deploy/api CRON_MAINTENANCE_MODE=true
kubectl rollout restart deploy/api && kubectl rollout status deploy/api

# 2. Disable encryption
kubectl set env deploy/api ENCRYPTION_ACTIVE=false
kubectl rollout restart deploy/api && kubectl rollout status deploy/api

# 3. Run reverse migration
kubectl exec deploy/api -c api -- python -m scripts.reverse_migrate_evening_notes

# 4. V16-FIX (M1): Verify ALL unresolved dead letters, not just decrypt
ALL_DL=$(kubectl exec deploy/api -c api -- python -c "
from sqlalchemy import create_engine, text
from app.config import settings
e = create_engine(settings.DATABASE_URL.replace('+asyncpg', ''))
with e.connect() as c:
    r = c.execute(text(
        \"SELECT operation, COUNT(*) FROM encryption_dead_letters \"
        \"WHERE source_table = 'daily_logs' \"
        \"AND resolved_at IS NULL \"
        \"GROUP BY operation\"
    )).fetchall()
    for op, cnt in r:
        print(f'{op}: {cnt}')
    if not r:
        print('CLEAN')
")

echo "Unresolved DLs: $ALL_DL"
if echo "$ALL_DL" | grep -qv "CLEAN"; then
  echo "WARNING: Unresolved dead letters found."
  echo "Run: python -m scripts.resolve_dead_letters"
  echo "Note: reencrypt DLs will be resolved to plaintext during rollback (D39)."
fi

# 5. Verify plaintext restoration
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
echo "Rows still encrypted: $ENCRYPTED_LEFT (should be 0 or match DL count)"

# 6. Resume crons
kubectl set env deploy/api CRON_MAINTENANCE_MODE=false
kubectl rollout restart deploy/api
echo "Day 3+ rollback complete."
```

---

## D. Observability `[V16-FIX]`

### D.1 Metrics — All 5 Wired

| Metric | Type | Code Location | Wired? |
|--------|------|---------------|--------|
| `dead_letter_write_failures_total` | Counter | `_write_dead_letter` except (§5.4) | ✅ |
| `daily_log_decrypt_failures` | Counter | `get_evening_note` except (§5.3) | ✅ |
| `encryption_migration_rows_total` | Counter | `migrate_evening_notes` success (§5.4) | ✅ V16 |
| `encryption_migration_errors_total` | Counter | `migrate_evening_notes` except (§5.4) | ✅ V16 |
| `dead_letter_resolution_batch_total` | Counter | `resolve_dead_letters` batch loop (§5.9) | ✅ V16 |

### D.2 Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| `EncryptionMigrationStalled` | 0 rows migrated in 15 min | P2 |
| `DeadLetterBacklog` | Unresolved DLs > 100 for > 1 hour | P2 |
| `DeadLetterWriteFailure` | `dead_letter_write_failures_total` > 0 | P1 |
| `CircuitBreakerTripped` | `encryption_migration_errors_total` jumps by 10 in 1 min | P1 |
| `DLPoolUnavailable` | 3+ consecutive DL write failures (logged) | P1 — **V16 new** |

---

## E. Pre-Execution Checklist `[V16-UPDATED]`

- [ ] Product sign-off on DST "fire early" behavior
- [ ] `/health` endpoint returns `encryption_columns_present` and `code_version` (**V16**)
- [ ] Health gate `jq` keys verified against `/health` response (**V16**)
- [ ] Health gate script has empty-pod guard, deletionTimestamp filter (**V16**)
- [ ] Smoke test query filters `evening_note_ciphertext IS NOT NULL` (**V16**)
- [ ] `_write_dead_letter` returns `bool`, callers check it
- [ ] `resolve_dead_letters.py` allows `decrypt`+`reencrypt` when `ENCRYPTION_ACTIVE=false` (**V16**)
- [ ] All 5 metrics wired with counter increments (**V16 verified**)
- [ ] Re-encryption cursor advances after commit only (**V16**)
- [ ] `consecutive_dl_failures` abort at 3 implemented (**V16**)
- [ ] Label selector standardized to `app=api` everywhere (**V16**)
- [ ] `ENCRYPTION_KEYS` append-only documented in runbook
- [ ] 353 tests pass
- [ ] Staging dry-run completed with all 20e steps

---

## F. "Looks Safe But Isn't" — V16 Resolution

| V15 Claim | V15 Status | V16 Resolution |
|-----------|------------|----------------|
| Health gate robust | ❌ Checks non-existent key; missing 4 V14 guards | ✅ Restored V14 structure + `/health` returns `encryption_columns_present` |
| Smoke test verifies decrypt | ❌ `null` false-pass | ✅ Filters `ciphertext IS NOT NULL`; checks HTTP status; rejects `[encrypted]` |
| Re-encrypt cursor after commit | ❌ Code contradicted claim | ✅ Cursor advances on success/DL-ok only, after commit |
| Metrics all wired | ❌ 3 of 5 missing | ✅ All 5 counters in code |
| Day 3+ rollback safe | ⚠️ Decrypt-only check | ✅ Checks all operations |
| DL resolution handles rollback | ❌ Blocks reencrypt | ✅ Reencrypt resolves to plaintext during rollback (D39) |
| DL failure bounded | ⚠️ 10x retry noise | ✅ Aborts after 3 consecutive DL failures (I25) |
| Label selectors consistent | ❌ Mixed | ✅ Standardized `app=api` |

---

## G. Outstanding Items (Non-Blocking)

| Item | Status | Notes |
|------|--------|-------|
| `preStop` cron drain | Accepted | Sweep handles stragglers |
| `ENCRYPTION_KEYS` append-only | Documented | CI enforcement is post-Sprint 6 |
| DST "fire early" | Awaiting product | Must sign off before deploy |
| Empty string encryption | Documented | Round-trips correctly |
| DL retention cron | Post-Sprint 6 | Table grows until cleanup added |
| Migration 011b idempotency | Verify | If any env ran V13's 011b, use 011d |
| `sa.text()` bypasses validation | Accepted | Test T.14 catches typos at test time |
| `resolve_dead_letters` O(n²) on repeat runs | Minor | Document `--since` flag as post-Sprint 6 enhancement |
