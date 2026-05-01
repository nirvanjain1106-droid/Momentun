# Sprint 6 — Revision 10 — Part 2: Tests, Deployment, Observability

> Continuation of [Part 1](file:///c:/Users/nirva/Downloads/Momentum%20API/sprint6_v10_plan_part1.md)

---

## Test Plan — 240 Targets (was 213 in Rev 9)

### Step 0 (3 tests) — unchanged

### Feature 1 — Notifications (17 tests) `[V10-FIX: was 10]`

| # | Test | Assertion |
|---|------|-----------|
| 1.1 | `test_notification_created_with_fire_at` | `fire_at` UTC, 10min before start |
| 1.2 | `test_checkin_dedup_on_regeneration` | DO NOTHING prevents checkin duplicates |
| 1.3 | `test_checkin_dedup_after_dismiss` | Dismissed checkin still blocks duplicate |
| 1.4 | `test_task_reminder_dedup_on_regeneration` | Unique index prevents duplicates |
| 1.5 | `test_get_notifications_no_mutation` | GET doesn't set `delivered_at` |
| 1.6 | `test_ack_sets_delivered_at` | POST /ack sets field |
| 1.7 | `test_ack_idempotent` | Double-ack no error |
| 1.8 | `test_cursor_pagination_null_fire_at` | NULL sorts correctly |
| 1.9 | `test_notification_body_encrypted_in_db` | Ciphertext stored, plaintext in response |
| 1.10 | `test_task_reminder_upsert_on_regeneration` | Regen updates `fire_at`; no duplicate |
| **1.11** | **`test_upsert_preserves_dismissed_state`** `[V10-NEW]` | **Regeneration does NOT clear `dismissed_at`/`delivered_at`. Assert dismissed reminder stays dismissed when schedule regenerates with same `fire_at`.** |
| **1.12** | **`test_upsert_with_index_elements`** `[V10-NEW]` | **Verify upsert works against partial unique index using `index_elements` + `index_where` (not `constraint=`).** |
| **1.13** | **`test_partial_index_null_bypass_prevented`** `[V10-NEW]` | **Insert with `reminder_task_id=NULL` does NOT bypass unique constraint. Assert `IS NOT NULL` predicate works.** |
| **1.14** | **`test_notification_generation_invalid_timezone`** `[V10-NEW]` | **`user.timezone='Fake/Zone'` → structured log, no crash, other users unaffected.** |
| **1.15** | **`test_notification_generation_dst_gap`** `[V10-NEW]` | **`target_date` is spring-forward day → graceful fallback time, no `NonExistentTimeError`.** |
| **1.16** | **`test_notification_generation_null_task_title`** `[V10-NEW]` | **`task.title=NULL` → fallback title "Task", no `TypeError`.** |
| **1.17** | **`test_notification_generation_bad_scheduled_start`** `[V10-NEW]` | **`task.scheduled_start='25:00'` → skip + log, no crash.** |

### Feature 2 — Recurring Tasks (10 tests) — unchanged

### Feature 3 — Milestones (7 tests) — unchanged

### Feature 4 — Rescue Mission (10 tests) `[V10-FIX: was 9]`

| # | Test | Assertion |
|---|------|-----------|
| 4.1–4.9 | (unchanged from Rev 9) | |
| **4.10** | **`test_rescue_dedup_allows_second_after_delivery`** `[V10-NEW]` | **Document behavior: delivered rescue (delivered_at NOT NULL) does NOT block second rescue creation. If business logic requires one-per-task-ever, test must fail and index must be updated.** |

### Feature 5 — Encryption (16 tests) `[V10-FIX: was 8]`

| # | Test | Assertion |
|---|------|-----------|
| 5.1 | `test_encryption_active_stores_ciphertext` | `ciphertext` populated, `evening_note` NULL |
| 5.2 | `test_encryption_inactive_stores_plaintext` | `evening_note` TEXT, `ciphertext` NULL |
| 5.3 | `test_encryption_failure_returns_500` | Bad key → 500, no data persisted |
| 5.4 | `test_read_path_decrypts_ciphertext` | `get_evening_note()` returns plaintext |
| 5.5 | `test_read_path_returns_plaintext_for_unmigrated` | Returns TEXT for legacy rows |
| 5.6 | `test_migration_script_idempotent` | Running twice → no double-encrypt |
| 5.7 | `test_migration_clears_plaintext` | After migration: note=NULL, ciphertext≠NULL |
| 5.8 | `test_migration_skips_concurrently_updated_row` | OCC: rowcount=0 if note changed |
| **5.9** | **`test_migration_has_order_by`** `[V10-NEW]` | **Assert batch SELECT includes `ORDER BY DailyLog.id`. Verify deterministic pagination.** |
| **5.10** | **`test_migration_update_checks_encrypted_false`** `[V10-NEW]` | **UPDATE WHERE clause includes `evening_note_encrypted == False`. Row already encrypted → skip.** |
| **5.11** | **`test_migration_resumes_after_crash`** `[V10-NEW]` | **Kill script mid-batch, restart. Verify cursor resumes from last `id`, no double-encrypt, progress continues.** |
| **5.12** | **`test_migration_circuit_breaker`** `[V10-NEW]` | **Inject 10 consecutive encryption failures → `RuntimeError` raised, migration halts cleanly.** |
| **5.13** | **`test_read_path_null_encrypted_flag`** `[V10-NEW]` | **`evening_note_encrypted=NULL` → treats as plaintext, logs warning.** |
| **5.14** | **`test_read_path_corrupted_ciphertext`** `[V10-NEW]` | **Invalid ciphertext → 500, no plaintext leak.** |
| **5.15** | **`test_key_version_mismatch`** `[V10-NEW]` | **Decrypt with wrong key version → graceful error + metric.** |
| **5.16** | **`test_encryption_failure_rolls_back_transaction`** `[V10-NEW]` | **D9 end-to-end: encrypt raises → entire transaction rolls back, no partial write.** |

### Feature 5 — Test 5.8 Design `[V10-FIX]`

```python
async def test_migration_skips_concurrently_updated_row():
    """
    V10-FIX: Uses asyncio.gather for real concurrent execution
    (was sequential in Rev 9, giving false confidence).
    """
    async with AsyncSessionLocal() as db:
        log = DailyLog(user_id=user.id, log_date=date.today(),
                       evening_note="Original text",
                       evening_note_encrypted=False)
        db.add(log)
        await db.commit()
        log_id = log.id

    async def migration_path():
        async with AsyncSessionLocal() as migration_db:
            row = await migration_db.execute(
                select(DailyLog).where(DailyLog.id == log_id)
            )
            row = row.scalar_one()
            original_text = row.evening_note

            # Yield control to let user_path run
            await asyncio.sleep(0.1)

            ciphertext = encrypt_field(original_text)
            stmt = sa_update(DailyLog).where(
                DailyLog.id == log_id,
                DailyLog.evening_note == original_text,
                DailyLog.evening_note_encrypted == False,  # V10-FIX
            ).values(
                evening_note_ciphertext=ciphertext.encode('utf-8'),
                evening_note_encrypted=True,
                evening_note=None,
            )
            result = await migration_db.execute(stmt)
            await migration_db.commit()
            return result.rowcount

    async def user_path():
        await asyncio.sleep(0.05)  # Run between migration read and write
        async with AsyncSessionLocal() as user_db:
            user_row = await user_db.execute(
                select(DailyLog).where(DailyLog.id == log_id)
            )
            user_row = user_row.scalar_one()
            user_row.evening_note_ciphertext = encrypt_field("Updated").encode('utf-8')
            user_row.evening_note_encrypted = True
            user_row.evening_note = None
            await user_db.commit()

    # V10: Real concurrent execution
    results = await asyncio.gather(migration_path(), user_path())
    migration_rowcount = results[0]
    assert migration_rowcount == 0  # Skipped!

    async with AsyncSessionLocal() as verify_db:
        final = await verify_db.execute(select(DailyLog).where(DailyLog.id == log_id))
        final = final.scalar_one()
        assert final.evening_note is None
        assert final.evening_note_encrypted is True
        assert decrypt_field(final.evening_note_ciphertext.decode('utf-8')) == "Updated"
```

### Concurrency & Deployment Tests `[V10-NEW]`

| # | Test | Assertion |
|---|------|-----------|
| **C.1** | `test_concurrent_regeneration_under_load` | `asyncio.gather` with 5 sessions hitting same user schedule → no duplicate notifications |
| **C.2** | `test_migration_two_instances_race` | Two migration scripts concurrently → no double-encrypt via OCC |
| **C.3** | `test_rolling_deploy_mixed_encryption_mode` | Simulate two app instances (flag true/false) → DB remains consistent |
| **C.4** | `test_ack_nonexistent_notification` | POST /ack with random UUID → 404, no crash |
| **C.5** | `test_get_notifications_excludes_dismissed` | Poll returns only actionable notifications |

### Feature 6 — Heatmap (4 tests) — unchanged

### Total: 162 existing + **78 new** = **240 targets**

---

## Deployment Order `[V10-FIX]`

```
 1.  Step 0 — Pre-condition tests. Must pass.
 2.  Migration 006 — Notification table + constraints (indexes on empty table: no CONCURRENTLY needed)
 3.  Migration 007 — Recurring task rules table
 4.  Migration 007b — Task columns (CREATE INDEX CONCURRENTLY for ix_tasks_rescue_candidate)
 5.  Migration 008 — Goal milestones table
 6.  Migration 009 — Heatmap index (CREATE INDEX CONCURRENTLY)
 7.  Migration 010 — Trajectory bonus columns on Goal          ← V10-FIX: MOVED BEFORE code deploy
 8.  Deploy feature code (Features 1-4, 6) + encryption write path (ENCRYPTION_ACTIVE=false)
 9.  Migration 011 — DailyLog encryption columns (ciphertext BYTEA, encrypted BOOLEAN NOT NULL DEFAULT FALSE)
10.  Deploy encryption-aware read path (get_evening_note helper)
11.  VERIFY: 100% pods running Step 10 code (health check gate)  ← V10-NEW
12.  Set ENCRYPTION_ACTIVE=true
13.  Run scripts/encrypt_data.py (OCC-guarded, cursor-paginated, circuit-breaker)
14.  Verify (TWO queries):
       SELECT count(*) FROM daily_logs WHERE evening_note IS NOT NULL AND evening_note_encrypted = true; → 0
       SELECT count(*) FROM daily_logs WHERE evening_note IS NOT NULL AND evening_note_encrypted = false; → 0  ← V10-NEW
```

> [!IMPORTANT]
> **V10 deployment order changes:**
> 1. **Migration 010 moved before code deploy** (Step 7→7). Feature 4 code references trajectory columns — deploying code before migration causes `column does not exist` crash.
> 2. **Step 11 added:** Health check gate ensures 100% pod rollout before flag flip. Prevents mixed-mode writes in rolling deploy.
> 3. **Step 8 includes write path:** Encryption write path deploys with feature code (handles `ENCRYPTION_ACTIVE=false` correctly).
> 4. **Step 14 has TWO verification queries:** Second query catches unmigrated rows skipped by OCC.
> 5. **Migration 007b/009 use CONCURRENTLY** for indexes on existing tables.

### Rollback Procedures `[V10-NEW]`

| Step | Rollback Action |
|------|-----------------|
| Step 8 (code deploy) | Revert to previous Docker image. Migrations 006-010 are additive (new tables/columns), safe with old code. |
| Step 12 (flag flip) | Set `ENCRYPTION_ACTIVE=false`. New writes go to plaintext. Existing ciphertext readable via read path. |
| Step 13 (migration) | Run `scripts/decrypt_data.py` (§5.7). Restores plaintext. Set `ENCRYPTION_ACTIVE=false`. |
| Migration 012 | **DO NOT RUN** until N+1 release. Dropping `evening_note` column is irreversible. |

---

## Observability `[V10-FIX]`

| Component | Log / Metric |
|-----------|-------------|
| Notifications | `notifications_generated` |
| Recurring Tasks | `recurring_task_instantiated` / `duplicate_blocked` / `max_reached` |
| Milestones | `milestone_completed` / `auto_skipped` (with `workable`) |
| Rescue | `rescue_missions_completed` (`total_duration_ms`) |
| Rescue LLM | `rescue_notification_created` (`llm_duration_ms`) |
| Rescue DB dedup | `rescue_notification_deduped_by_db` |
| Encryption migration | `encryption_migration_batch` / `_complete` / `_skipped` / `_row_error` / `_circuit_breaker` |
| Encryption | Hard 500 on failure (D9) |
| Heatmap | `heatmap_cache_invalidated` (debug) |
| Advisory Lock | `LatencyHistogram` P95 |
| **`[V10-NEW]` Encrypt/Decrypt** | **`Histogram`: `encrypt_field_duration_seconds`, `decrypt_field_duration_seconds`** |
| **`[V10-NEW]` Upsert conflicts** | **`Counter`: `notification_upsert_conflict_total` (labels: `type`, `result=updated\|skipped`)** |
| **`[V10-NEW]` Migration progress** | **`Gauge`: `encryption_migration_remaining_rows`, `encryption_migration_errors_total`** |
| **`[V10-NEW]` Timezone errors** | **`Counter`: `notification_timezone_error_total`** |

### Alert Rules `[V10-NEW]`

| Alert | Condition | Severity |
|-------|-----------|----------|
| Encryption error rate | `rate(encryption_error_total[5m]) > 0.01` | P1 |
| Migration stalled | `encryption_migration_remaining_rows` unchanged for 5min | P2 |
| Encrypt latency spike | `histogram_quantile(0.95, encrypt_field_duration_seconds) > 0.5` | P2 |
| Notification generation failure | `rate(notification_timezone_error_total[1h]) > 5` | P2 |

---

## Appendix A — V10 Change Summary

| Rev 9 Issue | Fix Applied | Section |
|---|---|---|
| Upsert resurrects dismissed notifications | Removed `dismissed_at`/`delivered_at` from `set_`; added `where=` guard (D15) | §1.3 |
| SQLAlchemy `constraint=` crash on partial index | Changed to `index_elements` + `index_where` (D11 updated) | §1.3 |
| Deployment order: code before Migration 010 | Moved Migration 010 before code deploy | Deployment |
| `body_encrypted` nullable vs D5 | `TEXT NOT NULL` | §1.1 |
| Partial index NULL bypass | Added `IS NOT NULL` predicates to all partial indexes | §1.1 |
| `CREATE INDEX` locks production tables | `CREATE INDEX CONCURRENTLY` for existing tables | §1.1, §4.2 |
| Migration missing `ORDER BY` | Added `ORDER BY DailyLog.id` + cursor pagination | §5.4 |
| Migration missing `encrypted == False` guard | Added to UPDATE WHERE clause | §5.4 |
| Batch migration stalls on single error | Per-row try/except + circuit breaker | §5.4 |
| Key rotation undefined | Key versioning strategy (D14) | §5.6 |
| No rollback path | Reverse migration script + rollback procedures | §5.7, Deployment |
| `get_evening_note` NULL boolean | Explicit `is True` check | §5.3 |
| Timezone/DST crashes | try/except + fallback | §1.3 |
| Null title crash | `(task.title or "Task")[:50]` | §1.3 |
| `_parse_time` crash | try/except + skip | §1.3 |
| Weak concurrency test (5.8) | `asyncio.gather` with real sessions | §5.8 test |
| Missing verification query | Two-query verification in Step 14 | Deployment |
| No observability for encryption latency | Histograms + alert rules | Observability |
| Missing tests | +27 new tests (240 total) | Test Plan |
| "Unchanged" sections unreviewed | Documented interaction points with new schema | Throughout |
| Rolling deploy race | Health check gate at Step 11 | Deployment |
| Pool exhaustion risk | Documented: pool_size=10 + max_overflow=20 = 30 max. Semaphore(3) × 2 conn = 6 per week request. Safe for ~4 concurrent. | Invariants |

---

## Appendix B — "Unchanged" Section Interaction Audit `[V10-NEW]`

| Unchanged Section | Interacts With New Schema? | Risk | Action |
|---|---|---|---|
| Feature 2 (Recurring Tasks) | Yes — generates tasks that trigger notification reminders | Low | Integration test: recurring task → notification generated |
| Feature 3 (Milestones) | No direct interaction | None | — |
| Feature 4.1 (Rescue Launcher) | Yes — creates rescue notifications, uses D12 partial index | Medium | Test: rescue launcher → notification insert → dedup index works |
| Feature 4.3 (Rate Limiting) | No direct interaction | None | — |
| Feature 4.4 (Trajectory Bonus) | Yes — requires Migration 010 columns | **High** | **V10-FIX: Migration 010 moved before code deploy** |
| Feature 6 (Heatmap) | No direct interaction | None | — |
| Step 0 (Pre-conditions) | No | None | — |
| API GET/POST /ack | Yes — reads encrypted `body_encrypted` | Medium | Test: poll returns decrypted body; ack on encrypted notification works |
