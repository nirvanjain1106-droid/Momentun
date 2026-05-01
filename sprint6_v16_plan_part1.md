# Sprint 6 — Implementation Plan (Revision 16)

> [!IMPORTANT]
> Supersedes Rev 15. All changes marked `[V16-FIX]`. Synthesizes two independent kill-test reviews of V15.

---

## V16 Change Summary

| # | V15 Issue | V16 Fix | Source |
|---|-----------|---------|--------|
| B1 | Health gate checks non-existent `.encryption_columns_present` + 4 regressions from V14 | Restore V14 gate structure with `-c api`, `deletionTimestamp`, version check, empty-pod guard | R1-B1, R2-C1 |
| B2 | Smoke test `jq` falsely passes on `null` evening notes | Filter for `evening_note IS NOT NULL` in test query; check HTTP status + reject `[encrypted]` | R1-B2, R2-M1 |
| B3 | Re-encryption cursor advances before commit (V15 claim not implemented) | Cursor moves only after successful reencrypt or successful DL write | R2-C2 |
| B4 | 3 of 5 metrics declared but not wired | All 5 counters added to code | R2-C3 |
| M1 | Day 3+ rollback only checks `decrypt` DLs | Check ALL unresolved DLs regardless of operation | R1-C3 |
| M2 | `resolve_dead_letters` guard blocks `reencrypt` during rollback | Allow `reencrypt` + `decrypt` when `ENCRYPTION_ACTIVE=false`; `encrypt` requires `true` | R1-C4 |
| M3 | No dedicated DL failure abort threshold | `consecutive_dl_failures` counter, abort after 3 | R1-C5 |
| M4 | Label selector inconsistency (`app=api` vs `app=momentum-api`) | Standardized to `app=api` everywhere | R2-M2 |
| M5 | Forward migration silent on OCC skip | Warning log added | R2-M3 |
| M6 | `_resolve_decrypt` missing `rowcount` check | Added for consistency | R2-M4 |

---

## Updated Invariants

| # | Invariant |
|---|-----------|
| I1–I24 | Unchanged from Rev 15 |
| I25 | `[V16]` **Migration aborts after 3 consecutive DL write failures**, not 10 encryption retries. Prevents retry noise on DL pool outages. |

## Updated Design Decisions

| # | Decision |
|---|----------|
| D31–D36 | Unchanged from V15 |
| D37 | `[V16]` **Health gate checks `encryption_active` + `code_version` + empty-pod guard + deletionTimestamp filter.** Matches `/health` payload exactly. |
| D38 | `[V16]` **Smoke test selects rows with `evening_note IS NOT NULL AND evening_note_encrypted = true`.** Validates actual decryption, not null passthrough. |
| D39 | `[V16]` **`resolve_dead_letters` only requires `ENCRYPTION_ACTIVE=true` for `encrypt` operations.** `decrypt` and `reencrypt` resolve to plaintext and can run during rollback. |

---

## Feature 5 — Encryption Pipeline (V16 Changes Only)

> Sections unchanged from V15: §5.1 (Migration 011), §5.1b (DL Table), §5.2 (Encryption Module), §5.2d (DL Pool), §5.3 (Read Path). See V15 Part 1.

### 5.4 Forward Migration `[V16-FIX]`

```python
# app/core/encryption.py (or scripts/migrate_evening_notes.py)

from prometheus_client import Counter

dl_write_failures = Counter(
    'dead_letter_write_failures_total',
    'Dead letter writes that failed',
)
# V16-FIX (B4): All counters wired
encryption_migration_rows = Counter(
    'encryption_migration_rows_total',
    'Rows successfully encrypted by migration',
)
encryption_migration_errors = Counter(
    'encryption_migration_errors_total',
    'Rows that failed encryption during migration',
)


async def _write_dead_letter(
    source_table: str, source_row_id, operation: str, error: str
) -> bool:
    """Unchanged from V15. Uses DLSessionLocal, returns bool."""
    try:
        async with DLSessionLocal() as dl_db:
            stmt = pg_insert(EncryptionDeadLetter).values(
                source_table=source_table,
                source_row_id=source_row_id,
                operation=operation,
                error_message=error[:500],
            ).on_conflict_do_update(
                index_elements=['source_table', 'source_row_id', 'operation'],
                index_where=sa.text("resolved_at IS NULL"),
                set_={
                    'error_message': error[:500],
                    'last_retry_at': func.now(),
                },
            )
            await dl_db.execute(stmt)
            await dl_db.commit()
        return True
    except Exception as dl_err:
        dl_write_failures.inc()
        logger.error("dead_letter_write_failed", extra={
            "source_row_id": str(source_row_id),
            "dl_error": str(dl_err),
        })
        return False


async def migrate_evening_notes():
    """
    V16 fixes over V15:
    1. Wired encryption_migration_rows/errors counters (B4)
    2. Dedicated consecutive_dl_failures abort at 3 (M3, I25)
    3. Warning log on OCC skip (M5)
    """
    if not settings.ENCRYPTION_ACTIVE:
        raise RuntimeError("ENCRYPTION_ACTIVE must be True before migration.")

    batch_size = 500
    total_migrated = 0
    total_skipped = 0
    total_errors = 0
    total_dl_failures = 0
    consecutive_errors = 0
    consecutive_dl_failures = 0  # V16-FIX (M3, I25)
    MAX_CONSECUTIVE_ERRORS = 10
    MAX_CONSECUTIVE_DL_FAILURES = 3  # V16-FIX (M3, I25)

    last_created_at = datetime.min.replace(tzinfo=timezone.utc)
    last_id = uuid.UUID('00000000-0000-0000-0000-000000000000')

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

            for row in batch:
                try:
                    original_text = row.evening_note
                    ciphertext = encrypt_field_versioned(original_text)
                    if ciphertext is None:
                        raise ValueError("encrypt_field_versioned returned None")

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
                        encryption_migration_rows.inc()  # V16-FIX (B4)
                        consecutive_errors = 0
                        consecutive_dl_failures = 0  # V16-FIX: reset on success
                    else:
                        total_skipped += 1
                        # V16-FIX (M5): Warn on OCC skip
                        logger.warning("encryption_migration_occ_skip", extra={
                            "daily_log_id": str(row.id),
                        })

                    last_created_at = row.created_at
                    last_id = row.id

                except Exception as e:
                    consecutive_errors += 1
                    total_errors += 1
                    encryption_migration_errors.inc()  # V16-FIX (B4)

                    dl_ok = await _write_dead_letter(
                        'daily_logs', row.id, 'encrypt', str(e)
                    )

                    if dl_ok:
                        last_created_at = row.created_at
                        last_id = row.id
                        consecutive_dl_failures = 0  # V16-FIX: reset
                    else:
                        total_dl_failures += 1
                        consecutive_dl_failures += 1  # V16-FIX (M3)
                        logger.warning("cursor_held_for_untracked_row", extra={
                            "daily_log_id": str(row.id),
                        })

                        # V16-FIX (I25): Abort early on DL pool outage
                        if consecutive_dl_failures >= MAX_CONSECUTIVE_DL_FAILURES:
                            await db.commit()
                            raise RuntimeError(
                                f"Dead-letter tracking unavailable — "
                                f"{MAX_CONSECUTIVE_DL_FAILURES} consecutive "
                                f"DL write failures. Aborting to prevent "
                                f"silent data loss."
                            )

                    logger.error("encryption_migration_row_error", extra={
                        "daily_log_id": str(row.id), "error": str(e),
                    })

                    if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                        await db.commit()
                        raise RuntimeError(
                            f"Circuit breaker: {MAX_CONSECUTIVE_ERRORS} "
                            f"consecutive failures. Last: {e}"
                        )

            await db.commit()
            logger.info("encryption_migration_batch", extra={
                "migrated": total_migrated, "skipped": total_skipped,
                "errors": total_errors, "dl_failures": total_dl_failures,
            })

    logger.info("encryption_migration_complete", extra={
        "migrated": total_migrated, "skipped": total_skipped,
        "errors": total_errors, "dl_failures": total_dl_failures,
    })
```

### 5.7 Reverse Migration — Unchanged from V15

### 5.8 Re-Encryption Job `[V16-FIX]`

```python
async def reencrypt_evening_notes():
    """
    V16-FIX (B3): Cursor advances ONLY after successful reencrypt
    or successful DL write. Matches V15 §5.7 pattern exactly.
    V15: OCC includes evening_note_encrypted == True (M6).
    V15: Uses encrypt_field_versioned(force_version=).
    """
    target_version = settings.ACTIVE_KEY_VERSION
    if not settings.ENCRYPTION_ACTIVE:
        raise RuntimeError("ENCRYPTION_ACTIVE must be True.")

    batch_size = 500
    total = 0
    last_created_at = datetime.min.replace(tzinfo=timezone.utc)
    last_id = uuid.UUID('00000000-0000-0000-0000-000000000000')

    logger.info("reencryption_started", extra={"target_version": target_version})

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

            # V16-FIX (B3): Initialize batch cursor to CURRENT position
            batch_last_ca = last_created_at
            batch_last_id = last_id

            for row in batch:
                ct_raw = row.evening_note_ciphertext
                if isinstance(ct_raw, memoryview):
                    ct_raw = ct_raw.tobytes()
                ct = ct_raw.decode('utf-8')
                current_version, _ = _parse_version_prefix(ct)

                if current_version == target_version:
                    # Already at target version — safe to advance
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
                        # V16-FIX (B3): Advance on success
                        batch_last_ca = row.created_at
                        batch_last_id = row.id

                except Exception as e:
                    dl_ok = await _write_dead_letter(
                        'daily_logs', row.id, 'reencrypt', str(e)
                    )
                    if dl_ok:
                        # V16-FIX (B3): Advance only if DL tracked
                        batch_last_ca = row.created_at
                        batch_last_id = row.id
                    # else: cursor holds — row retried next run
                    logger.error("reencrypt_error", extra={
                        "daily_log_id": str(row.id), "error": str(e),
                    })

            await db.commit()
            # V16-FIX (B3): Cursor advances AFTER commit
            last_created_at = batch_last_ca
            last_id = batch_last_id

    logger.info("reencryption_complete", extra={
        "total": total, "target_version": target_version,
    })
```

### 5.9 Dead-Letter Resolution `[V16-FIX]`

```python
# scripts/resolve_dead_letters.py

from prometheus_client import Counter

# V16-FIX (B4): Wire the missing counter
dl_resolution_batches = Counter(
    'dead_letter_resolution_batch_total',
    'Batches processed by dead letter resolution',
)


async def _resolve_decrypt(db, dl, row):
    """
    V16-FIX (M6): Added rowcount check for consistency.
    """
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
    stmt = sa_update(DailyLog).where(
        DailyLog.id == row.id,
        DailyLog.evening_note_encrypted == True,
    ).values(
        evening_note=plaintext,
        evening_note_encrypted=False,
        evening_note_ciphertext=None,
    )
    result = await db.execute(stmt)
    if result.rowcount == 1:
        dl.resolved_at = func.now()
    else:
        # OCC skip: row state changed concurrently
        dl.resolved_at = func.now()
        logger.warning("decrypt_dl_occ_skip", extra={
            "source_row_id": str(dl.source_row_id),
        })


async def _resolve_reencrypt(db, dl, row):
    """
    V16-FIX (D39): When ENCRYPTION_ACTIVE=false, resolve
    reencrypt DLs by decrypting to plaintext instead of re-encrypting.
    """
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
        # Normal: re-encrypt to active version
        new_ct = encrypt_field_versioned(
            plaintext, force_version=settings.ACTIVE_KEY_VERSION
        )
        stmt = sa_update(DailyLog).where(
            DailyLog.id == row.id,
            DailyLog.evening_note_encrypted == True,
        ).values(
            evening_note_ciphertext=new_ct.encode('utf-8'),
        )
    else:
        # V16-FIX (D39): Rollback mode — decrypt to plaintext
        stmt = sa_update(DailyLog).where(
            DailyLog.id == row.id,
            DailyLog.evening_note_encrypted == True,
        ).values(
            evening_note=plaintext,
            evening_note_encrypted=False,
            evening_note_ciphertext=None,
        )

    result = await db.execute(stmt)
    if result.rowcount == 1:
        dl.resolved_at = func.now()
    else:
        dl.resolved_at = func.now()
        logger.warning("reencrypt_dl_occ_skip", extra={
            "source_row_id": str(dl.source_row_id),
        })


async def resolve_dead_letters(operation_filter: str = None):
    """
    V16-FIX (M2): Guard only blocks `encrypt` when ENCRYPTION_ACTIVE=false.
    decrypt and reencrypt can resolve during rollback.
    V16-FIX (B4): dl_resolution_batches counter wired.
    """
    # V16-FIX (D39): Only 'encrypt' requires ENCRYPTION_ACTIVE
    if not settings.ENCRYPTION_ACTIVE and operation_filter == 'encrypt':
        raise RuntimeError(
            "ENCRYPTION_ACTIVE must be True to resolve 'encrypt' dead letters. "
            "Use 'decrypt' or 'reencrypt' during rollback."
        )

    resolved = 0
    still_failing = 0
    last_created_at = datetime.min.replace(tzinfo=timezone.utc)
    last_id = uuid.UUID('00000000-0000-0000-0000-000000000000')

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

        dl_resolution_batches.inc()  # V16-FIX (B4)

        async with AsyncSessionLocal() as db:
            for dl_snap in batch:
                last_created_at = dl_snap.created_at
                last_id = dl_snap.id

                try:
                    async with db.begin_nested():
                        dl = await db.get(EncryptionDeadLetter, dl_snap.id)
                        if dl is None or dl.resolved_at is not None:
                            continue

                        handler = _DISPATCH.get(dl.operation)
                        if handler is None:
                            logger.warning("unknown_dl_operation", extra={
                                "operation": dl.operation, "id": str(dl.id),
                            })
                            continue

                        row = await db.get(DailyLog, dl.source_row_id)
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

    logger.info("dead_letter_resolution_complete", extra={
        "resolved": resolved, "still_failing": still_failing,
    })
```

### 5.10 Health Endpoint `[V16-FIX]`

```python
@router.get("/health")
async def health_check():
    """
    V16-FIX (B1, D37): Response keys must match health gate expectations.
    Added encryption_columns_present for gate validation.
    """
    columns_present = False
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(sa.text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'daily_logs' "
                "AND column_name IN ('evening_note_encrypted', 'evening_note_ciphertext')"
            ))
            columns_present = len(result.fetchall()) == 2
    except Exception:
        pass

    return {
        "status": "ok",
        "code_version": 16,
        "encryption_active": settings.ENCRYPTION_ACTIVE,
        "encryption_columns_present": columns_present,  # V16-FIX
    }
```

---

## Appendix: Review Cross-Reference

| Finding | Review 1 | Review 2 | V16 Fix |
|---------|----------|----------|---------|
| Health gate key mismatch + regressions | B1 (Blocker) | C1 (Blocker) | §5.10 + Part 2 §B gate |
| Smoke test null false-pass | B2 (Blocker) | M1 (Major) | Part 2 §B Step 20e |
| Re-encrypt cursor before commit | — | C2 (Blocker) | §5.8 cursor pattern |
| 3 metrics unwired | — | C3 (Blocker) | §5.4, §5.9 counters |
| Day 3+ rollback decrypt-only DL check | C3 (Major) | — | Part 2 §C all-ops check |
| resolve_dead_letters blocks reencrypt | C4 (Major) | — | §5.9 guard (D39) |
| DL failure stall / 10x retry noise | C5 (Major) | — | §5.4 consecutive_dl_failures |
| Label selector mismatch | — | M2 (Major) | Part 2 standardized `app=api` |
| OCC skip silent | — | M3 (Major) | §5.4 warning log |
| _resolve_decrypt missing rowcount | — | M4 (Minor) | §5.9 rowcount check |
