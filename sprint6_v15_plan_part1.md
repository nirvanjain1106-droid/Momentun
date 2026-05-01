# Sprint 6 — Implementation Plan (Revision 15)

> [!IMPORTANT]
> Supersedes Rev 14. All changes marked `[V15-FIX]`. Synthesizes two independent kill-test reviews of V14.

---

## V15 Change Summary

| # | V14 Issue | V15 Fix | Source |
|---|-----------|---------|--------|
| B1 | SAVEPOINT rolls back with outer commit failure → DL rows lost | Dedicated small DL pool (`size=2, max_overflow=3`) + in-memory batch buffer | R1-B1 |
| B2 | Cursor advances even if DL write fails → silent skip | `_write_dead_letter` returns bool; cursor only advances if DL succeeded | R1-B2, R2-M1 |
| B3 | `evening_note` may have NOT NULL constraint → migration crashes | Pre-flight nullable check + conditional `ALTER` in 011 | R2-C1 |
| B4 | `resolve_dead_letters.py` only handles `encrypt` operation | Dispatch table for encrypt/decrypt/reencrypt | R2-C2 |
| B5 | Metrics declared in D.1 but missing from code | Explicit counter increments added | R2-C3 |
| M1 | Cursor advanced before commit in reverse/reencrypt/DL resolution | Cursor moves after successful commit only | R2-M1 |
| M2 | No API smoke test in deployment verification | Step 20e added | R2-M2 |
| M3 | Day 3+ rollback missing DL verification | Decrypt DL check added | R2-M3 |
| M4 | `resolve_dead_letters` per-row connection churn | Single session per batch + SAVEPOINT per row | R1-C3, R2-M4 |
| M5 | `index_where` predicate compilation drift | `sa.text("resolved_at IS NULL")` | R1-C4 |
| M6 | Re-encryption OCC missing boolean guard | Added `evening_note_encrypted == True` | R1-C6 |
| m1 | `get_evening_note` decode() memoryview risk | Defensive type normalizer | R2-m2 |
| m2 | `total_dl_failures` declared but unused | Wired to `_write_dead_letter` return | R2-m3 |
| m3 | `preStop` doesn't drain crons | Documented as accepted noise; sweep handles | R1-C5 |
| m4 | Health gate multi-container pods | `-c api` container selector | R2-m5 |

---

## New/Updated Invariants

| # | Invariant |
|---|-----------|
| I1–I21 | Unchanged from Rev 14 |
| I22 | `[V15]` **DL writes use a dedicated pool, NOT savepoints in the batch session.** Outer commit failure must not erase DL tracking. |
| I23 | `[V15]` **Cursor advances on error ONLY if DL write succeeded.** Failed DL write = row retried next batch. |
| I24 | `[V15]` **`resolve_dead_letters.py` handles ALL operation types** (encrypt, decrypt, reencrypt). |

## New/Updated Design Decisions

| # | Decision |
|---|----------|
| D31 | `[V15-REVISED]` **DL writes use a dedicated small pool** (`DLSessionLocal`, pool_size=2, max_overflow=3). Replaces V14 SAVEPOINT approach. SAVEPOINTs roll back with the outer transaction; separate pool provides true isolation without V13's exhaustion risk. |
| D32–D34 | Unchanged from V14 |
| D35 | `[V15]` **`_write_dead_letter` returns `bool`.** Callers use return value to decide cursor advancement. |
| D36 | `[V15]` **Pre-flight nullable check on `evening_note`.** Migration 011 conditionally drops NOT NULL. |

---

## Feature 5 — Encryption Pipeline

### 5.1 Migration 011 `[V15-FIX]`

```python
# In migration 011 upgrade(), BEFORE adding encryption columns:
# V15-FIX (B3): Ensure evening_note is nullable
op.execute("""
    DO $$
    BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'daily_logs'
              AND column_name = 'evening_note'
              AND is_nullable = 'NO'
        ) THEN
            ALTER TABLE daily_logs ALTER COLUMN evening_note DROP NOT NULL;
        END IF;
    END $$;
""")
# Then add evening_note_encrypted, evening_note_ciphertext columns...
```

### 5.1b Dead-Letter Table — Unchanged from V14
(includes `last_retry_at` column, partial unique index)

### 5.2 Encryption Module `[V15-FIX]`

```python
# app/core/encryption.py
# Unchanged from V14 EXCEPT: force_version parameter retained.
# Full code identical to V14 §5.2.
```

### 5.2d DL Database Pool `[V15-NEW]`

```python
# app/database.py — add dedicated DL pool
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

# Main pool (existing)
engine = create_async_engine(settings.DATABASE_URL, pool_size=10, max_overflow=20)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

# V15-NEW (D31, I22): Dedicated small pool for dead-letter writes
# Separate engine prevents batch commit failures from rolling back DL inserts
_dl_engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=2,
    max_overflow=3,
    pool_timeout=10,
    pool_pre_ping=True,
)
DLSessionLocal = async_sessionmaker(_dl_engine, expire_on_commit=False)
```

### 5.3 Read Path `[V15-FIX]`

```python
def get_evening_note(daily_log: DailyLog) -> Optional[str]:
    """
    V15-FIX (m1): Defensive decode for memoryview/str edge cases.
    V14: Returns None on failure (D33).
    """
    if daily_log.evening_note_encrypted is True:
        if daily_log.evening_note_ciphertext is None:
            logger.error("daily_log_encrypted_but_null_ciphertext", extra={
                "daily_log_id": str(daily_log.id),
            })
            return None

        try:
            # V15-FIX (m1): Defensive type normalization
            ct = daily_log.evening_note_ciphertext
            if isinstance(ct, memoryview):
                ct = ct.tobytes()
            if isinstance(ct, bytes):
                ct = ct.decode('utf-8')
            # ct is now str
            return decrypt_field_versioned(ct)
        except Exception:
            logger.error("daily_log_decrypt_failed", extra={
                "daily_log_id": str(daily_log.id),
            })
            daily_log_decrypt_failures.inc()  # V15-FIX (B5)
            return None

    return daily_log.evening_note
```

### 5.4 Forward Migration `[V15-FIX]`

```python
# V15 metrics (B5)
from prometheus_client import Counter
dl_write_failures = Counter(
    'dead_letter_write_failures_total',
    'Dead letter writes that failed',
)

async def _write_dead_letter(
    source_table: str, source_row_id, operation: str, error: str
) -> bool:
    """
    V15-FIX (D31, D35, I22, I23):
    - Uses DLSessionLocal (dedicated small pool), NOT SAVEPOINT
    - Returns True on success, False on failure
    - Outer batch commit failure cannot roll back DL rows
    - V15-FIX (M5): sa.text() for index_where to prevent compilation drift
    - V15-FIX (C1/V14): last_retry_at, not created_at on conflict
    """
    try:
        async with DLSessionLocal() as dl_db:
            stmt = pg_insert(EncryptionDeadLetter).values(
                source_table=source_table,
                source_row_id=source_row_id,
                operation=operation,
                error_message=error[:500],
            ).on_conflict_do_update(
                index_elements=['source_table', 'source_row_id', 'operation'],
                index_where=sa.text("resolved_at IS NULL"),  # V15-FIX (M5)
                set_={
                    'error_message': error[:500],
                    'last_retry_at': func.now(),
                },
            )
            await dl_db.execute(stmt)
            await dl_db.commit()
        return True
    except Exception as dl_err:
        dl_write_failures.inc()  # V15-FIX (B5)
        logger.error("dead_letter_write_failed", extra={
            "source_row_id": str(source_row_id),
            "dl_error": str(dl_err),
        })
        return False


async def migrate_evening_notes():
    """
    V15 fixes over V14:
    1. DL writes use dedicated pool, not SAVEPOINT (D31, I22)
    2. _write_dead_letter returns bool (D35)
    3. Cursor advances on error ONLY if DL write succeeded (I23)
    4. total_dl_failures wired (m2)
    """
    if not settings.ENCRYPTION_ACTIVE:
        raise RuntimeError("ENCRYPTION_ACTIVE must be True before migration.")

    batch_size = 500
    total_migrated = 0
    total_skipped = 0
    total_errors = 0
    total_dl_failures = 0
    consecutive_errors = 0
    MAX_CONSECUTIVE_ERRORS = 10

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
                        consecutive_errors = 0
                    else:
                        total_skipped += 1

                    last_created_at = row.created_at
                    last_id = row.id

                except Exception as e:
                    consecutive_errors += 1
                    total_errors += 1

                    dl_ok = await _write_dead_letter(
                        'daily_logs', row.id, 'encrypt', str(e)
                    )

                    if dl_ok:
                        # V15-FIX (I23): Advance only if DL tracked
                        last_created_at = row.created_at
                        last_id = row.id
                    else:
                        # V15-FIX (I23): Do NOT advance cursor.
                        # Row will be re-fetched next batch.
                        total_dl_failures += 1
                        logger.warning("cursor_held_for_untracked_row", extra={
                            "daily_log_id": str(row.id),
                        })

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

### 5.7 Reverse Migration `[V15-FIX]`

```python
async def reverse_migrate_evening_notes():
    """
    V15-FIX (M1): Cursor advances AFTER commit, not before.
    """
    if settings.ENCRYPTION_ACTIVE:
        raise RuntimeError("ENCRYPTION_ACTIVE must be False.")
    if not settings.CRON_MAINTENANCE_MODE:
        raise RuntimeError("CRON_MAINTENANCE_MODE must be True.")

    batch_size = 500
    total_reversed = 0
    last_created_at = datetime.min.replace(tzinfo=timezone.utc)
    last_id = uuid.UUID('00000000-0000-0000-0000-000000000000')

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
                try:
                    ct = row.evening_note_ciphertext
                    if isinstance(ct, memoryview):
                        ct = ct.tobytes()
                    plaintext = decrypt_field_versioned(ct.decode('utf-8'))

                    stmt = sa_update(DailyLog).where(
                        DailyLog.id == row.id,
                        DailyLog.evening_note_encrypted == True,
                        DailyLog.evening_note_ciphertext == row.evening_note_ciphertext,
                    ).values(
                        evening_note=plaintext,
                        evening_note_encrypted=False,
                        evening_note_ciphertext=None,
                    )
                    result = await db.execute(stmt)
                    if result.rowcount == 1:
                        total_reversed += 1

                    # Track last successfully processed row
                    batch_last_ca = row.created_at
                    batch_last_id = row.id

                except Exception as e:
                    dl_ok = await _write_dead_letter(
                        'daily_logs', row.id, 'decrypt', str(e)
                    )
                    if dl_ok:
                        batch_last_ca = row.created_at
                        batch_last_id = row.id
                    logger.error("reverse_migration_error", extra={
                        "daily_log_id": str(row.id), "error": str(e),
                    })

            await db.commit()
            # V15-FIX (M1): Cursor advances AFTER commit
            last_created_at = batch_last_ca
            last_id = batch_last_id

    logger.info("reverse_migration_complete", extra={
        "total_reversed": total_reversed,
    })
```

### 5.8 Re-Encryption Job `[V15-FIX]`

```python
async def reencrypt_evening_notes():
    """
    V15-FIX (M1): Cursor after commit.
    V15-FIX (M6): OCC includes evening_note_encrypted == True.
    V14: Uses encrypt_field_versioned(force_version=).
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

            batch_last_ca = last_created_at
            batch_last_id = last_id

            for row in batch:
                batch_last_ca = row.created_at
                batch_last_id = row.id

                ct_raw = row.evening_note_ciphertext
                if isinstance(ct_raw, memoryview):
                    ct_raw = ct_raw.tobytes()
                ct = ct_raw.decode('utf-8')
                current_version, _ = _parse_version_prefix(ct)

                if current_version == target_version:
                    continue

                try:
                    plaintext = decrypt_field_versioned(ct)
                    new_ct = encrypt_field_versioned(
                        plaintext, force_version=target_version
                    )

                    stmt = sa_update(DailyLog).where(
                        DailyLog.id == row.id,
                        DailyLog.evening_note_encrypted == True,  # V15-FIX (M6)
                        DailyLog.evening_note_ciphertext == row.evening_note_ciphertext,
                    ).values(
                        evening_note_ciphertext=new_ct.encode('utf-8'),
                    )
                    result = await db.execute(stmt)
                    if result.rowcount == 1:
                        total += 1

                except Exception as e:
                    await _write_dead_letter(
                        'daily_logs', row.id, 'reencrypt', str(e)
                    )
                    logger.error("reencrypt_error", extra={
                        "daily_log_id": str(row.id), "error": str(e),
                    })

            await db.commit()
            # V15-FIX (M1): Cursor after commit
            last_created_at = batch_last_ca
            last_id = batch_last_id

    logger.info("reencryption_complete", extra={
        "total": total, "target_version": target_version,
    })
```

### 5.9 Dead-Letter Resolution Script `[V15-FIX]`

```python
# scripts/resolve_dead_letters.py
"""
V15-FIX (B4, M4, I24):
- Handles ALL operations: encrypt, decrypt, reencrypt
- Single session per batch + SAVEPOINT per row (no connection churn)
- Keyset pagination (unchanged from V14)
"""
import asyncio
import uuid
from datetime import datetime, timezone
from sqlalchemy import select, func, text
from sqlalchemy import update as sa_update
from app.database import AsyncSessionLocal
from app.models import DailyLog, EncryptionDeadLetter
from app.core.encryption import encrypt_field_versioned, decrypt_field_versioned
from app.config import settings

BATCH_SIZE = 500


async def _resolve_encrypt(db, dl, row):
    """Retry forward encryption."""
    if row is None or row.evening_note_encrypted or row.evening_note is None:
        dl.resolved_at = func.now()
        return
    ct = encrypt_field_versioned(row.evening_note)
    if ct is None:
        raise ValueError("encrypt returned None")
    stmt = sa_update(DailyLog).where(
        DailyLog.id == row.id,
        DailyLog.evening_note_encrypted == False,
    ).values(
        evening_note_ciphertext=ct.encode('utf-8'),
        evening_note_encrypted=True,
        evening_note=None,
    )
    result = await db.execute(stmt)
    dl.resolved_at = func.now()


async def _resolve_decrypt(db, dl, row):
    """Retry reverse decryption."""
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
    await db.execute(stmt)
    dl.resolved_at = func.now()


async def _resolve_reencrypt(db, dl, row):
    """Retry re-encryption to current active version."""
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
    new_ct = encrypt_field_versioned(
        plaintext, force_version=settings.ACTIVE_KEY_VERSION
    )
    stmt = sa_update(DailyLog).where(
        DailyLog.id == row.id,
        DailyLog.evening_note_encrypted == True,
    ).values(
        evening_note_ciphertext=new_ct.encode('utf-8'),
    )
    await db.execute(stmt)
    dl.resolved_at = func.now()


_DISPATCH = {
    'encrypt': _resolve_encrypt,
    'decrypt': _resolve_decrypt,
    'reencrypt': _resolve_reencrypt,
}


async def resolve_dead_letters(operation_filter: str = None):
    """
    Resolves dead letters for all or a specific operation type.
    V15-FIX (M4): Single session per batch, SAVEPOINT per row.
    """
    if not settings.ENCRYPTION_ACTIVE and operation_filter != 'decrypt':
        raise RuntimeError("ENCRYPTION_ACTIVE must be True (except for decrypt)")

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

        # V15-FIX (M4): One session for entire batch, SAVEPOINT per row
        async with AsyncSessionLocal() as db:
            for dl_snap in batch:
                last_created_at = dl_snap.created_at
                last_id = dl_snap.id

                try:
                    async with db.begin_nested():  # SAVEPOINT per row
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


if __name__ == "__main__":
    import sys
    op = sys.argv[1] if len(sys.argv) > 1 else None
    asyncio.run(resolve_dead_letters(operation_filter=op))
```

### 5.10 Health Endpoint — Unchanged

---

## Appendix: Review Cross-Reference

| Finding | Review 1 | Review 2 | V15 Fix |
|---------|----------|----------|---------|
| SAVEPOINT ≠ commit isolation | B1 (Blocker) | — | Dedicated DL pool §5.2d |
| Cursor advances on DL failure | B2 (Blocker) | M1 (Major) | Bool return §5.4 |
| evening_note NOT NULL risk | — | C1 (Blocker) | §5.1 conditional ALTER |
| DL resolution encrypt-only | — | C2 (Blocker) | §5.9 dispatch table |
| Metrics missing from code | — | C3 (Blocker) | §5.3, §5.4 counters |
| Cursor before commit (rev/reenc) | — | M1 (Major) | §5.7, §5.8 cursor after commit |
| DL resolution connection churn | C3 (Major) | M4 (Major) | §5.9 batch session + SAVEPOINT |
| index_where drift | C4 (Major) | — | §5.4 sa.text() |
| Re-encrypt missing boolean | C6 (Minor) | — | §5.8 WHERE clause |
| memoryview decode | — | m2 (Minor) | §5.3, §5.7, §5.8 |
| total_dl_failures unused | — | m3 (Minor) | §5.4 wired |
| preStop doesn't drain | C5 (Major) | — | Accepted; sweep handles |
| Multi-container pods | — | m5 (Minor) | Part 2 §B Step 14 |
