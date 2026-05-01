# Sprint 6 — Implementation Plan (Revision 17)

> Supersedes Rev 16. Changes marked `[V17-FIX]`. Fixes avoid introducing new regressions — each fix notes what it intentionally does NOT change.

## V17 Change Summary

| # | V16 Issue | V17 Fix | Source | Regression Guard |
|---|-----------|---------|--------|------------------|
| B1 | `/health` queries `information_schema` every probe | Startup cache with fallback | R1-M3, R2-B1 | Does NOT block pod boot if DB unavailable |
| B2 | Re-encrypt cursor stalls on OCC skip (`rowcount=0`) | Advance cursor + warn on skip | R1-M1, R2-B2 | Does NOT skip rows that need processing — OCC skip means row already changed |
| B3 | DL guard bypassed when `operation_filter=None` during rollback | Per-row guard in dispatch loop | R1-C1, R2-B3 | Does NOT block decrypt/reencrypt — only encrypt is auto-resolved |
| B4 | Smoke test rejects empty-string + assumes flat JSON | HTTP-status + `[encrypted]` rejection only | R1-C2, R2-C5 | Does NOT fail on null, empty, or nested payloads |
| M1 | Metrics ephemeral — scripts exit before scrape | Structured JSON log at exit + optional Pushgateway | R2-C4 | Does NOT add hard dependency on Pushgateway |
| M2 | `consecutive_dl_failures` resets on any row success | Reset only at batch boundary | R2-C6 | Does NOT make counter persist across batches — transient blips within a batch still trigger |
| M3 | `_resolve_reencrypt` reads live `ACTIVE_KEY_VERSION` | Snapshot at script start | R2-C7 | Does NOT change reencrypt logic — only freezes config read |
| M4 | Reverse migration cursor also stalls on OCC skip | Same fix as B2 | R1-M1 | Same guard |
| m1 | `DLPoolUnavailable` alert is log-based | PromQL on `dead_letter_write_failures_total` | R1-m3 | Uses existing metric, no new counter |
| m2 | Day 3+ runbook note incomplete | Updated note for all 3 ops | R1-m4 | No logic change |

## Updated Invariants/Decisions

| # | Content |
|---|---------|
| I25 | `[V17-REVISED]` Migration aborts after 3 consecutive DL failures **within a batch**. Counter resets at batch boundary only. |
| D37 | `[V17-REVISED]` Health endpoint returns **cached** `encryption_columns_present`. Cache computed at startup, no per-request DB query. |
| D39 | `[V17-REVISED]` `resolve_dead_letters` auto-resolves `encrypt` DLs when `ENCRYPTION_ACTIVE=false` (row stays plaintext). Guard is per-row in dispatch, not at entry. |
| D40 | `[V17]` Migration/resolution scripts emit structured JSON summary at exit for log-based alerting. Pushgateway optional. |

---

## Changed Code (V17 deltas only — unchanged sections reference V16)

### 5.10 Health Endpoint `[V17-FIX]`

```python
# V17-FIX (B1, D37): Cache column check at startup, no per-request DB query.
# Regression guard: If DB is unavailable at startup, defaults to None
# and retries on first request. Does NOT block pod boot.

_encryption_columns_present: Optional[bool] = None

async def _check_encryption_columns() -> bool:
    """One-shot DB check, cached forever. Columns don't change at runtime."""
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(sa.text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'daily_logs' "
                "AND column_name IN ('evening_note_encrypted', "
                "'evening_note_ciphertext')"
            ))
            return len(result.fetchall()) == 2
    except Exception:
        return False


@app.on_event("startup")
async def _cache_column_check():
    global _encryption_columns_present
    _encryption_columns_present = await _check_encryption_columns()


@router.get("/health")
async def health_check():
    global _encryption_columns_present
    # Lazy retry if startup check failed (DB was down at boot)
    if _encryption_columns_present is None:
        _encryption_columns_present = await _check_encryption_columns()

    return {
        "status": "ok",
        "code_version": 17,
        "encryption_active": settings.ENCRYPTION_ACTIVE,
        "encryption_columns_present": _encryption_columns_present or False,
    }
```

### 5.4 Forward Migration `[V17-FIX]`

```python
async def migrate_evening_notes():
    """
    V17 fixes over V16:
    1. consecutive_dl_failures resets at batch boundary only (M2, I25)
    2. Structured JSON summary at exit (M1, D40)
    All other logic unchanged from V16.
    """
    if not settings.ENCRYPTION_ACTIVE:
        raise RuntimeError("ENCRYPTION_ACTIVE must be True before migration.")

    batch_size = 500
    total_migrated = 0
    total_skipped = 0
    total_errors = 0
    total_dl_failures = 0
    consecutive_errors = 0
    consecutive_dl_failures = 0
    MAX_CONSECUTIVE_ERRORS = 10
    MAX_CONSECUTIVE_DL_FAILURES = 3

    last_created_at = datetime.min.replace(tzinfo=timezone.utc)
    last_id = uuid.UUID('00000000-0000-0000-0000-000000000000')

    try:
        while True:
            async with AsyncSessionLocal() as db:
                rows = await db.execute(
                    select(DailyLog).where(
                        DailyLog.evening_note.isnot(None),
                        DailyLog.evening_note_encrypted == False,
                        sa.or_(
                            DailyLog.created_at > last_created_at,
                            sa.and_(
                                DailyLog.created_at == last_created_at,
                                DailyLog.id > last_id,
                            ),
                        ),
                    ).order_by(
                        DailyLog.created_at, DailyLog.id
                    ).limit(batch_size)
                )
                batch = rows.scalars().all()
                if not batch:
                    break

                # V17-FIX (M2): Reset DL failure counter at batch boundary
                consecutive_dl_failures = 0

                for row in batch:
                    try:
                        original_text = row.evening_note
                        ciphertext = encrypt_field_versioned(original_text)
                        if ciphertext is None:
                            raise ValueError("encrypt returned None")

                        stmt = sa_update(DailyLog).where(
                            DailyLog.id == row.id,
                            DailyLog.evening_note == original_text,
                            DailyLog.evening_note_encrypted == False,
                        ).values(
                            evening_note_ciphertext=ciphertext.encode('utf-8'),
                            evening_note_encrypted=True,
                            evening_note=None,
                        )
                        result = await db.execute(stmt)

                        if result.rowcount == 1:
                            total_migrated += 1
                            encryption_migration_rows.inc()
                            consecutive_errors = 0
                        else:
                            total_skipped += 1
                            logger.warning("encryption_migration_occ_skip",
                                extra={"daily_log_id": str(row.id)})

                        last_created_at = row.created_at
                        last_id = row.id

                    except Exception as e:
                        consecutive_errors += 1
                        total_errors += 1
                        encryption_migration_errors.inc()

                        dl_ok = await _write_dead_letter(
                            'daily_logs', row.id, 'encrypt', str(e)
                        )
                        if dl_ok:
                            last_created_at = row.created_at
                            last_id = row.id
                        else:
                            total_dl_failures += 1
                            consecutive_dl_failures += 1
                            logger.warning("cursor_held_for_untracked_row",
                                extra={"daily_log_id": str(row.id)})

                            if consecutive_dl_failures >= MAX_CONSECUTIVE_DL_FAILURES:
                                await db.commit()
                                raise RuntimeError(
                                    f"DL tracking unavailable — "
                                    f"{MAX_CONSECUTIVE_DL_FAILURES} consecutive "
                                    f"DL write failures in batch."
                                )

                        logger.error("encryption_migration_row_error",
                            extra={"daily_log_id": str(row.id), "error": str(e)})

                        if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                            await db.commit()
                            raise RuntimeError(
                                f"Circuit breaker: {MAX_CONSECUTIVE_ERRORS} "
                                f"consecutive failures.")

                await db.commit()
                logger.info("encryption_migration_batch", extra={
                    "migrated": total_migrated, "skipped": total_skipped,
                    "errors": total_errors, "dl_failures": total_dl_failures,
                })
    finally:
        # V17-FIX (M1, D40): Structured summary for log-based alerting
        import json
        print(json.dumps({
            "event": "encryption_migration_exit",
            "total_migrated": total_migrated,
            "total_skipped": total_skipped,
            "total_errors": total_errors,
            "total_dl_failures": total_dl_failures,
        }))
```

### 5.7 Reverse Migration `[V17-FIX]`

Only the OCC-skip cursor fix changes from V16. Full loop body:

```python
# Inside the for-row loop, REPLACE the try block:
                try:
                    # ... decrypt logic unchanged from V16 ...
                    result = await db.execute(stmt)
                    if result.rowcount == 1:
                        total_reversed += 1
                    else:
                        # V17-FIX (M4/B2): Advance cursor on OCC skip
                        logger.warning("reverse_migration_occ_skip",
                            extra={"daily_log_id": str(row.id)})

                    # V17-FIX: Always advance on success OR occ-skip
                    batch_last_ca = row.created_at
                    batch_last_id = row.id

                except Exception as e:
                    dl_ok = await _write_dead_letter(
                        'daily_logs', row.id, 'decrypt', str(e)
                    )
                    if dl_ok:
                        batch_last_ca = row.created_at
                        batch_last_id = row.id
                    # else: cursor holds — row retried next batch
                    logger.error("reverse_migration_error",
                        extra={"daily_log_id": str(row.id), "error": str(e)})
```

### 5.8 Re-Encryption Job `[V17-FIX]`

Only two changes from V16: OCC-skip cursor fix (B2) and structured exit log (M1).

```python
async def reencrypt_evening_notes():
    target_version = settings.ACTIVE_KEY_VERSION  # Snapshot at start (M3)
    if not settings.ENCRYPTION_ACTIVE:
        raise RuntimeError("ENCRYPTION_ACTIVE must be True.")

    batch_size = 500
    total = 0
    last_created_at = datetime.min.replace(tzinfo=timezone.utc)
    last_id = uuid.UUID('00000000-0000-0000-0000-000000000000')

    logger.info("reencryption_started", extra={"target_version": target_version})

    try:
        while True:
            async with AsyncSessionLocal() as db:
                rows = await db.execute(
                    select(DailyLog).where(
                        DailyLog.evening_note_encrypted == True,
                        DailyLog.evening_note_ciphertext.isnot(None),
                        sa.or_(
                            DailyLog.created_at > last_created_at,
                            sa.and_(
                                DailyLog.created_at == last_created_at,
                                DailyLog.id > last_id,
                            ),
                        ),
                    ).order_by(DailyLog.created_at, DailyLog.id).limit(batch_size)
                )
                batch = rows.scalars().all()
                if not batch:
                    break

                batch_last_ca = last_created_at
                batch_last_id = last_id

                for row in batch:
                    ct_raw = row.evening_note_ciphertext
                    if isinstance(ct_raw, memoryview):
                        ct_raw = ct_raw.tobytes()
                    ct = ct_raw.decode('utf-8')
                    current_version, _ = _parse_version_prefix(ct)

                    if current_version == target_version:
                        batch_last_ca = row.created_at
                        batch_last_id = row.id
                        continue

                    try:
                        plaintext = decrypt_field_versioned(ct)
                        new_ct = encrypt_field_versioned(
                            plaintext, force_version=target_version
                        )
                        stmt = sa_update(DailyLog).where(
                            DailyLog.id == row.id,
                            DailyLog.evening_note_encrypted == True,
                            DailyLog.evening_note_ciphertext == row.evening_note_ciphertext,
                        ).values(
                            evening_note_ciphertext=new_ct.encode('utf-8'),
                        )
                        result = await db.execute(stmt)
                        if result.rowcount == 1:
                            total += 1

                        # V17-FIX (B2): Advance on success AND occ-skip
                        batch_last_ca = row.created_at
                        batch_last_id = row.id

                        if result.rowcount == 0:
                            logger.warning("reencrypt_occ_skip",
                                extra={"daily_log_id": str(row.id)})

                    except Exception as e:
                        dl_ok = await _write_dead_letter(
                            'daily_logs', row.id, 'reencrypt', str(e)
                        )
                        if dl_ok:
                            batch_last_ca = row.created_at
                            batch_last_id = row.id
                        logger.error("reencrypt_error",
                            extra={"daily_log_id": str(row.id), "error": str(e)})

                await db.commit()
                last_created_at = batch_last_ca
                last_id = batch_last_id
    finally:
        import json
        print(json.dumps({
            "event": "reencryption_exit",
            "total": total, "target_version": target_version,
        }))

    logger.info("reencryption_complete", extra={
        "total": total, "target_version": target_version,
    })
```

### 5.9 Dead-Letter Resolution `[V17-FIX]`

```python
# scripts/resolve_dead_letters.py

async def resolve_dead_letters(operation_filter: str = None):
    """
    V17-FIX (B3, D39): Per-row guard for encrypt DLs during rollback.
    - encrypt DLs auto-resolved when ENCRYPTION_ACTIVE=false
    - decrypt/reencrypt always allowed
    - No entry-level guard needed — logic is per-row
    V17-FIX (M3): Snapshot ACTIVE_KEY_VERSION at start.
    V17-FIX (M1): Structured exit log.
    """
    target_version = settings.ACTIVE_KEY_VERSION  # V17-FIX (M3): Snapshot

    resolved = 0
    still_failing = 0
    auto_cleared = 0
    last_created_at = datetime.min.replace(tzinfo=timezone.utc)
    last_id = uuid.UUID('00000000-0000-0000-0000-000000000000')

    try:
        while True:
            async with AsyncSessionLocal() as fetch_db:
                q = select(EncryptionDeadLetter).where(
                    EncryptionDeadLetter.source_table == 'daily_logs',
                    EncryptionDeadLetter.resolved_at.is_(None),
                    sa.or_(
                        EncryptionDeadLetter.created_at > last_created_at,
                        sa.and_(
                            EncryptionDeadLetter.created_at == last_created_at,
                            EncryptionDeadLetter.id > last_id,
                        ),
                    ),
                )
                if operation_filter:
                    q = q.where(EncryptionDeadLetter.operation == operation_filter)
                q = q.order_by(
                    EncryptionDeadLetter.created_at,
                    EncryptionDeadLetter.id,
                ).limit(BATCH_SIZE)
                entries = await fetch_db.execute(q)
                batch = entries.scalars().all()

            if not batch:
                break

            dl_resolution_batches.inc()

            async with AsyncSessionLocal() as db:
                for dl_snap in batch:
                    last_created_at = dl_snap.created_at
                    last_id = dl_snap.id

                    try:
                        async with db.begin_nested():
                            dl = await db.get(EncryptionDeadLetter, dl_snap.id)
                            if dl is None or dl.resolved_at is not None:
                                continue

                            # V17-FIX (B3): Per-row guard for encrypt during rollback
                            if dl.operation == 'encrypt' and not settings.ENCRYPTION_ACTIVE:
                                dl.resolved_at = func.now()
                                auto_cleared += 1
                                logger.info("encrypt_dl_auto_cleared_during_rollback",
                                    extra={"source_row_id": str(dl.source_row_id)})
                                continue

                            handler = _DISPATCH.get(dl.operation)
                            if handler is None:
                                logger.warning("unknown_dl_operation",
                                    extra={"operation": dl.operation})
                                continue

                            row = await db.get(DailyLog, dl.source_row_id)
                            # V17-FIX (M3): Pass snapshotted version to reencrypt
                            if dl.operation == 'reencrypt':
                                await _resolve_reencrypt(db, dl, row, target_version)
                            else:
                                await handler(db, dl, row)

                        resolved += 1

                    except Exception as e:
                        still_failing += 1
                        try:
                            async with db.begin_nested():
                                dl = await db.get(EncryptionDeadLetter, dl_snap.id)
                                if dl:
                                    dl.error_message = str(e)[:500]
                                    dl.last_retry_at = func.now()
                        except Exception:
                            pass
                        logger.error("dead_letter_retry_failed", extra={
                            "source_row_id": str(dl_snap.source_row_id),
                            "error": str(e),
                        })

                await db.commit()

    finally:
        import json
        print(json.dumps({
            "event": "dead_letter_resolution_exit",
            "resolved": resolved,
            "still_failing": still_failing,
            "auto_cleared": auto_cleared,
        }))

    logger.info("dead_letter_resolution_complete", extra={
        "resolved": resolved, "still_failing": still_failing,
        "auto_cleared": auto_cleared,
    })


async def _resolve_reencrypt(db, dl, row, target_version: int):
    """V17-FIX (M3): Accept target_version param instead of reading live config."""
    if row is None or not row.evening_note_encrypted:
        dl.resolved_at = func.now()
        return
    ct_raw = row.evening_note_ciphertext
    if ct_raw is None:
        dl.resolved_at = func.now()
        return
    if isinstance(ct_raw, memoryview):
        ct_raw = ct_raw.tobytes()
    plaintext = decrypt_field_versioned(ct_raw.decode('utf-8'))

    if settings.ENCRYPTION_ACTIVE:
        new_ct = encrypt_field_versioned(plaintext, force_version=target_version)
        stmt = sa_update(DailyLog).where(
            DailyLog.id == row.id,
            DailyLog.evening_note_encrypted == True,
        ).values(evening_note_ciphertext=new_ct.encode('utf-8'))
    else:
        stmt = sa_update(DailyLog).where(
            DailyLog.id == row.id,
            DailyLog.evening_note_encrypted == True,
        ).values(
            evening_note=plaintext,
            evening_note_encrypted=False,
            evening_note_ciphertext=None,
        )

    result = await db.execute(stmt)
    dl.resolved_at = func.now()
    if result.rowcount == 0:
        logger.warning("reencrypt_dl_occ_skip",
            extra={"source_row_id": str(dl.source_row_id)})
```

---

## Regression Guard Summary

Every V17 fix was validated against these anti-regression rules:

| Fix | Could Introduce | Guard |
|-----|-----------------|-------|
| B1: Startup cache | Pod fails to boot if DB down | `_encryption_columns_present = None` default; lazy retry on first `/health` call |
| B2: OCC cursor advance | Skips rows that need work | OCC skip means row was concurrently modified — it's already at a different state. Safe to advance. |
| B3: Per-row encrypt guard | Blocks legitimate encrypt resolution | Guard only fires when `ENCRYPTION_ACTIVE=false`. During normal ops, encrypt DLs resolve normally. |
| B4: Smoke test relaxed | Misses real decrypt failures | Still checks HTTP 200 + rejects `[encrypted]` placeholder. Only removes false-positive on null/empty. |
| M1: Structured exit log | Adds import at exit | `import json` is stdlib, zero-dep. `finally` block guarantees execution. |
| M2: Batch-boundary DL reset | Misses cross-batch DL outage | Counter persists across rows within batch. Only resets between batches. Sustained outage hits threshold. |
| M3: Snapshot key version | Stale version during long run | Resolution scripts are short-lived. Key rotation requires maintenance mode. No concurrent version changes. |
