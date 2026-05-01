# Sprint 6 — Tests, Deployment & Rollback (Revision 15)

> Part 2 of 2. See `sprint6_v15_plan_part1.md` for code fixes.

---

## A. New/Updated Test Targets (V15 additions to V14's 318)

### A.1 Blocker Fix Tests

| # | Test | Proves |
|---|------|--------|
| T.1 | `test_dl_write_uses_dedicated_pool_not_savepoint` — Assert `_write_dead_letter` opens `DLSessionLocal`, not `db.begin_nested()`. Mock `DLSessionLocal` and verify call. | B1 (I22) |
| T.2 | `test_dl_survives_outer_commit_failure` — Insert a DL via `_write_dead_letter`. Force outer `db.commit()` to raise `OperationalError`. Assert DL row exists in DB. | B1 (I22) |
| T.3 | `test_cursor_does_not_advance_if_dl_write_fails` — Mock `_write_dead_letter` to return `False`. Run migration on 1 row. Assert `last_created_at` / `last_id` did NOT advance. | B2 (I23) |
| T.4 | `test_cursor_advances_if_dl_write_succeeds` — Mock `_write_dead_letter` to return `True`. Run migration on 1 row that fails encryption. Assert cursor advanced. | B2 (I23) |
| T.5 | `test_evening_note_nullable_migration` — Run migration 011 on a schema where `evening_note` has NOT NULL. Assert constraint is dropped. | B3 |
| T.6 | `test_resolve_dl_handles_decrypt_operation` — Insert DL with `operation='decrypt'`. Run resolution. Assert DL resolved and row decrypted. | B4 (I24) |
| T.7 | `test_resolve_dl_handles_reencrypt_operation` — Insert DL with `operation='reencrypt'`. Run resolution. Assert DL resolved and row re-encrypted to active version. | B4 (I24) |
| T.8 | `test_dl_write_failure_increments_metric` — Mock DLSessionLocal to raise. Call `_write_dead_letter`. Assert `dead_letter_write_failures_total` incremented. | B5 |

### A.2 Major/Minor Fix Tests

| # | Test | Proves |
|---|------|--------|
| T.9 | `test_reverse_migration_cursor_after_commit` — SIGKILL simulation: assert cursor is only persisted after successful commit, not before. | M1 |
| T.10 | `test_reencrypt_cursor_after_commit` — Same as T.9 for re-encryption script. | M1 |
| T.11 | `test_deployment_api_smoke_encrypted_row` — Insert encrypted row. Call GET `/daily-logs/{id}`. Assert 200 and valid plaintext in response. | M2 |
| T.12 | `test_day3_rollback_checks_decrypt_dls` — After reverse migration, assert query for unresolved `operation='decrypt'` DLs returns 0. | M3 |
| T.13 | `test_resolve_dl_connection_count` — Insert 1000 DLs. Run resolution. Assert total DB connections opened ≤ (1000/BATCH_SIZE) + 10. | M4 |
| T.14 | `test_dl_index_where_exact_sql` — Compile `_write_dead_letter`'s `index_where`. Assert compiled SQL == `resolved_at IS NULL` (no parens, no schema prefix). | M5 |
| T.15 | `test_reencrypt_occ_has_boolean_guard` — Assert the UPDATE WHERE clause includes `evening_note_encrypted == True`. | M6 |
| T.16 | `test_get_evening_note_memoryview` — Pass `memoryview(b"v1:...")` as ciphertext. Assert successful decrypt. | m1 |
| T.17 | `test_total_dl_failures_incremented` — Force DL write failure. Assert `total_dl_failures` counter > 0 at end of migration. | m2 |
| T.18 | `test_health_gate_targets_api_container` — Assert health gate script uses `-c api` in `kubectl exec`. | m4 |

**Updated total test targets: 336** (318 from V14 + 18 new V15 tests)

---

## B. Deployment Order `[V15-UPDATED]`

### Pre-Flight Additions (Before Step 1)

```bash
# V15-FIX (B3): Verify evening_note nullable
echo "=== Pre-flight: checking evening_note constraint ==="
NULLABLE=$(kubectl exec deploy/api -c api -- python -c "
from sqlalchemy import inspect, create_engine
from app.config import settings
engine = create_engine(settings.DATABASE_URL.replace('+asyncpg', ''))
col = inspect(engine).get_columns('daily_logs')
nn = [c for c in col if c['name'] == 'evening_note'][0]['nullable']
print(nn)
")
if [ "$NULLABLE" = "False" ]; then
    echo "WARNING: evening_note is NOT NULL. Migration 011 will handle it."
fi
```

### Step 14 — Health Gate `[V15-FIX]`

```bash
# V15-FIX (m4): Target api container explicitly
PODS=$(kubectl get pods -l app=momentum-api \
  --field-selector=status.phase=Running \
  -o jsonpath='{.items[?(@.status.conditions[?(@.type=="Ready" && @.status=="True")])].metadata.name}')

for pod in $PODS; do
  HEALTH=$(kubectl exec "$pod" -c api -- curl -sf http://localhost:8000/health || echo '{}')
  HAS_COLS=$(echo "$HEALTH" | jq -r '.encryption_columns_present // false')
  if [ "$HAS_COLS" != "true" ]; then
    echo "FAIL: $pod missing encryption columns"
    exit 1
  fi
done
echo "Health gate passed for all ready pods."
```

### Step 20e — API Smoke Test `[V15-NEW]`

```bash
# V15-FIX (M2): End-to-end read test
echo "=== Step 20e: API Smoke Test ==="
# Pick a known encrypted row
TEST_ID=$(kubectl exec deploy/api -c api -- python -c "
from sqlalchemy import create_engine, text
from app.config import settings
e = create_engine(settings.DATABASE_URL.replace('+asyncpg', ''))
with e.connect() as c:
    r = c.execute(text(
        'SELECT id FROM daily_logs WHERE evening_note_encrypted = true LIMIT 1'
    )).fetchone()
    print(r[0] if r else '')
")

if [ -z "$TEST_ID" ]; then
  echo "No encrypted rows to smoke test. Skipping."
else
  RESULT=$(kubectl exec deploy/api -c api -- \
    curl -sf "http://localhost:8000/api/v1/daily-logs/$TEST_ID" \
    | jq -r '.evening_note // .data.evening_note // "MISSING"')

  if [ "$RESULT" = "MISSING" ] || [ "$RESULT" = "[encrypted]" ]; then
    echo "FAIL: Smoke test failed. Response: $RESULT"
    exit 1
  fi
  echo "Smoke test passed. Decrypted value present."
fi
```

---

## C. Rollback Matrix `[V15-UPDATED]`

| Phase | Safe? | Procedure | V15 Notes |
|-------|-------|-----------|-----------|
| **Before Migration (1-14)** | ✅ Yes | `kubectl rollout undo`. Schema is additive. | Unchanged |
| **Mid-Migration (Step 19)** | ✅ Yes | Kill script. Run `reverse_migrate_evening_notes.py`. | V15: DL tracking now survives batch failures (dedicated pool). Cursor doesn't advance on untracked failures. |
| **After Migration (Step 20)** | ✅ Yes | Set `ENCRYPTION_ACTIVE=false`, `CRON_MAINTENANCE_MODE=true`. Run reverse migration. | Unchanged |
| **Day 3+ Rollback** | ✅ Yes | Same as "After Migration". Reverse migration only touches `encrypted=True` rows. | **V15-FIX (M3)**: After reverse migration, verify 0 unresolved decrypt DLs. |
| **Key Rotation** | ⚠️ Conditional | If keys appended correctly: safe. If key removed: crash. | V15: No code-level enforcement added. Documented as operator discipline. |

### Day 3+ Rollback Checklist `[V15-FIX]`

```bash
# 1. Pause crons
kubectl set env deploy/api CRON_MAINTENANCE_MODE=true
kubectl rollout restart deploy/api && kubectl rollout status deploy/api

# 2. Disable encryption
kubectl set env deploy/api ENCRYPTION_ACTIVE=false
kubectl rollout restart deploy/api && kubectl rollout status deploy/api

# 3. Run reverse migration
kubectl exec deploy/api -c api -- python -m scripts.reverse_migrate_evening_notes

# 4. V15-FIX (M3): Verify no orphaned decrypt dead letters
DL_COUNT=$(kubectl exec deploy/api -c api -- python -c "
from sqlalchemy import create_engine, text
from app.config import settings
e = create_engine(settings.DATABASE_URL.replace('+asyncpg', ''))
with e.connect() as c:
    r = c.execute(text(
        \"SELECT COUNT(*) FROM encryption_dead_letters \"
        \"WHERE source_table = 'daily_logs' \"
        \"AND operation = 'decrypt' \"
        \"AND resolved_at IS NULL\"
    )).scalar()
    print(r)
")

if [ "$DL_COUNT" != "0" ]; then
  echo "WARNING: $DL_COUNT unresolved decrypt dead letters."
  echo "Run: python -m scripts.resolve_dead_letters decrypt"
  exit 1
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

## D. Observability `[V15-FIX]`

### D.1 Metrics — All Now Wired to Code

| Metric | Type | Code Location |
|--------|------|---------------|
| `dead_letter_write_failures_total` | Counter | `_write_dead_letter` except block (§5.4) |
| `daily_log_decrypt_failures` | Counter | `get_evening_note` except block (§5.3) |
| `dead_letter_resolution_batch_total` | Counter | `resolve_dead_letters` batch loop (§5.9) |
| `encryption_migration_rows_total` | Counter | `migrate_evening_notes` success path |
| `encryption_migration_errors_total` | Counter | `migrate_evening_notes` error path |

### D.2 Alerts — Unchanged from V14

| Alert | Condition | Severity |
|-------|-----------|----------|
| `EncryptionMigrationStalled` | 0 rows migrated in 15 min during active migration | P2 |
| `DeadLetterBacklog` | Unresolved DLs > 100 for > 1 hour | P2 |
| `DeadLetterWriteFailure` | `dead_letter_write_failures_total` > 0 | P1 |
| `CircuitBreakerTripped` | `encryption_migration_errors_total` jumps by 10 in 1 min | P1 |

---

## E. Pre-Execution Checklist `[V15-UPDATED]`

- [ ] **Product sign-off on DST "fire early"** behavior (required before deploy)
- [ ] Migration 011 tested on schema with NOT NULL `evening_note` (**V15 new**)
- [ ] `DLSessionLocal` pool configured in `app/database.py` (**V15 new**)
- [ ] `_write_dead_letter` returns `bool` and callers check it (**V15 new**)
- [ ] `resolve_dead_letters.py` handles encrypt/decrypt/reencrypt (**V15 new**)
- [ ] All 5 metrics wired with counter increments (**V15 new**)
- [ ] API smoke test endpoint returns decrypted plaintext
- [ ] Health gate uses `-c api` container selector (**V15 new**)
- [ ] `ENCRYPTION_KEYS` append-only documented in runbook
- [ ] 336 tests pass
- [ ] Staging dry-run completed with all 20e steps

---

## F. "Looks Safe But Isn't" — V15 Resolution

| V14 Claim | V14 Status | V15 Resolution |
|-----------|------------|----------------|
| SAVEPOINT maintains DL isolation | ❌ Broken | ✅ Replaced with dedicated DL pool. DL writes survive outer commit failure. |
| Cursor advances on error safely | ❌ Broken | ✅ `_write_dead_letter` returns bool. Cursor held if DL write failed. |
| `resolve_dead_letters` per-row commit | ⚠️ Connection churn | ✅ Single session per batch + SAVEPOINT per row. |
| `index_where` matches partial index | ⚠️ Drift risk | ✅ `sa.text("resolved_at IS NULL")`. Test T.14 enforces exact match. |
| `preStop: sleep 10` prevents stragglers | ⚠️ Doesn't drain | ⚠️ Accepted. Post-migration sweep catches stragglers. Documented. |
| DL resolution only handles `encrypt` | ❌ Gap | ✅ Dispatch table for all 3 operations. |
| Metrics declared but not wired | ❌ Gap | ✅ All 5 counters wired in code. |
| `evening_note` assumed nullable | ❌ Risk | ✅ Pre-flight check + conditional ALTER in 011. |
| Cursor before commit in reverse/reencrypt | ⚠️ SIGKILL risk | ✅ Cursor moves after `db.commit()`. |
| Health gate assumes single container | ⚠️ Risk | ✅ `-c api` selector added. |
| Day 3+ rollback skips DL check | ⚠️ Gap | ✅ Decrypt DL verification step added. |

---

## G. Outstanding Items (Non-Blocking)

| Item | Status | Action Required |
|------|--------|-----------------|
| `preStop` cron drain | Accepted risk | Sweep handles stragglers. No code change. |
| `ENCRYPTION_KEYS` append-only enforcement | Documented | Operator discipline. CI validation is a post-Sprint 6 enhancement. |
| DST gap "fire early" | Awaiting product | Must sign off before deploy. Code change only if they choose "skip reminder". |
| Empty string encryption | Documented | `encrypt_field_versioned("")` returns `""`. Round-trips correctly. Analytics may see "encrypted empty strings". |
| DL retention cron | Post-Sprint 6 | Table grows unbounded until cleanup cron is added. Non-blocking for initial deploy. |
| Migration 011b idempotency | Verify | If any env ran V13's 011b, V15 must use 011d. Confirm with migrations lead. |

---

## H. Runbook — Section Additions `[V15]`

### Resolving Dead Letters (Updated)

```bash
# Resolve ALL operations:
python -m scripts.resolve_dead_letters

# Resolve specific operation type:
python -m scripts.resolve_dead_letters encrypt
python -m scripts.resolve_dead_letters decrypt
python -m scripts.resolve_dead_letters reencrypt

# Check remaining:
SELECT operation, COUNT(*)
FROM encryption_dead_letters
WHERE resolved_at IS NULL
GROUP BY operation;
```

### Emergency: DL Write Failures Detected

```
1. Alert: dead_letter_write_failures_total > 0
2. Check DL pool health: SELECT count(*) FROM pg_stat_activity WHERE application_name LIKE '%dl%';
3. If pool saturated: increase DLSessionLocal max_overflow to 5
4. If persistent: check DL table locks, disk space
5. After fixing: re-run migration from cursor (idempotent)
6. Run post-migration sweep to catch any untracked rows
```
