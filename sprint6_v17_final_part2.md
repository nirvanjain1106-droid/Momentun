# Sprint 6 — Migration Scripts (Revision 17 — Final)

> **Self-contained document.** Part 2 of 3. No external revision references required.
> All migration script source code is fully specified here.

---

## 1. Shared Utility — `_write_dead_letter`

```python
# scripts/_dl_utils.py
# D31, I22, I23, D35: Dedicated pool, bool return, upsert with sa.text

import logging
import sqlalchemy as sa
from datetime import datetime, timezone
from app.database import DLSessionLocal

logger = logging.getLogger(__name__)

_DL_UPSERT = sa.text("""
    INSERT INTO encryption_dead_letters
        (source_table, source_row_id, operation, error_message, created_at)
    VALUES
        (:source_table, :source_row_id, :operation, :error_message, :now)
    ON CONFLICT (source_table, source_row_id, operation)
        WHERE resolved_at IS NULL
    DO UPDATE SET
        error_message = EXCLUDED.error_message,
        last_retry_at = EXCLUDED.created_at
""")


async def _write_dead_letter(
    source_table: str,
    source_row_id: str,
    operation: str,
    error_message: str,
) -> bool:
    """
    Returns True if DL row was persisted. False on failure.
    Callers use return value to decide cursor advancement (I23).
    Uses DLSessionLocal — isolated from batch transaction (I22).
    """
    try:
        async with DLSessionLocal() as dl_session:
            await dl_session.execute(_DL_UPSERT, {
                "source_table": source_table,
                "source_row_id": source_row_id,
                "operation": operation,
                "error_message": error_message[:2000],
                "now": datetime.now(timezone.utc),
            })
            await dl_session.commit()
        return True
    except Exception as exc:
        logger.error("dead_letter_write_failed", extra={
            "source_row_id": source_row_id,
            "operation": operation,
            "error": str(exc)[:500],
        })
        # Structured log replaces ephemeral Prometheus counter (never scraped).
        # DL write failure signal comes from exit log total_dl_failures field.
        logger.warning("dead_letter_write_failure_counted", extra={
            "source_row_id": source_row_id,
            "operation": operation,
        })
        return False
```

---

## 2. Forward Migration — `migrate_evening_notes.py`

```python
# scripts/migrate_evening_notes.py
# I7, I8, I9, I17, I20, I22, I23, I25, D11, D12, D40

import json
import asyncio
import logging
from uuid import UUID
from datetime import datetime, timezone

import sqlalchemy as sa
from app.database import AsyncSessionLocal
from app.core.encryption import encrypt_field_versioned
from app.config import settings
from scripts._dl_utils import _write_dead_letter

logger = logging.getLogger(__name__)

BATCH_SIZE = 500               # I8
CIRCUIT_BREAKER_LIMIT = 10     # I9
DL_ABORT_THRESHOLD = 3         # I25


async def migrate_evening_notes():
    """
    Encrypts all plaintext evening_note values in daily_logs.
    Keyset pagination (I7), OCC (I2), circuit breaker (I9).
    """
    if not settings.ENCRYPTION_ACTIVE:
        raise RuntimeError("ENCRYPTION_ACTIVE must be true for forward migration")  # I14
    if not settings.CRON_MAINTENANCE_MODE:
        raise RuntimeError("CRON_MAINTENANCE_MODE must be true during migration")  # I10

    cursor_created_at = datetime.min.replace(tzinfo=timezone.utc)  # D20
    cursor_id = UUID("00000000-0000-0000-0000-000000000000")       # D20

    total_encrypted = 0
    total_skipped = 0
    total_errors = 0
    total_dl_failures = 0
    consecutive_errors = 0
    batch_num = 0

    try:
        while True:
            batch_num += 1
            consecutive_dl_failures = 0  # I25: Reset at batch boundary

            async with AsyncSessionLocal() as db:
                # I7: Keyset pagination with composite cursor
                rows = (await db.execute(sa.text("""
                    SELECT id, created_at, evening_note
                    FROM daily_logs
                    WHERE evening_note_encrypted = false
                      AND evening_note IS NOT NULL
                      AND (created_at, id) > (:cursor_ts, :cursor_id)
                    ORDER BY created_at, id
                    LIMIT :batch_size
                """), {
                    "cursor_ts": cursor_created_at,
                    "cursor_id": str(cursor_id),
                    "batch_size": BATCH_SIZE,
                })).fetchall()

                if not rows:
                    logger.info("migration_complete", extra={
                        "total_encrypted": total_encrypted,
                        "total_skipped": total_skipped,
                        "total_errors": total_errors,
                    })
                    break

                for row in rows:
                    row_id, row_created_at, evening_note = row

                    try:
                        ciphertext = encrypt_field_versioned(evening_note)
                        if ciphertext is None:
                            raise ValueError("encrypt returned None for non-null input")

                        # I2: OCC — WHERE includes original values
                        result = await db.execute(sa.text("""
                            UPDATE daily_logs
                            SET evening_note_ciphertext = :ciphertext,
                                evening_note_encrypted = true,
                                evening_note = NULL
                            WHERE id = :id
                              AND evening_note_encrypted = false
                              AND evening_note = :original_note
                        """), {
                            "ciphertext": ciphertext.encode("utf-8"),
                            "id": str(row_id),
                            "original_note": evening_note,
                        })

                        if result.rowcount == 0:
                            # OCC skip — row modified concurrently
                            total_skipped += 1
                            logger.warning("migration_occ_skip", extra={
                                "row_id": str(row_id),
                            })
                        else:
                            total_encrypted += 1
                            consecutive_errors = 0

                        # I17: Advance cursor on success/OCC-skip
                        cursor_created_at = row_created_at
                        cursor_id = row_id

                    except Exception as exc:
                        consecutive_errors += 1
                        total_errors += 1

                        # I23: Track in DL; advance cursor only if DL write succeeded
                        dl_ok = await _write_dead_letter(
                            source_table="daily_logs",
                            source_row_id=str(row_id),
                            operation="encrypt",
                            error_message=str(exc),
                        )

                        if dl_ok:
                            cursor_created_at = row_created_at
                            cursor_id = row_id
                            consecutive_dl_failures = 0
                        else:
                            total_dl_failures += 1
                            consecutive_dl_failures += 1
                            # I25: Abort after 3 consecutive DL failures in batch
                            if consecutive_dl_failures >= DL_ABORT_THRESHOLD:
                                raise RuntimeError(
                                    f"Aborting: {DL_ABORT_THRESHOLD} consecutive "
                                    f"DL write failures in batch {batch_num}"
                                )

                        # I9: Circuit breaker on encryption failures
                        if consecutive_errors >= CIRCUIT_BREAKER_LIMIT:
                            raise RuntimeError(
                                f"Circuit breaker: {CIRCUIT_BREAKER_LIMIT} "
                                f"consecutive encryption failures"
                            )

                # D12: Commit at batch boundary, cursor already advanced
                await db.commit()

            logger.info("migration_batch_complete", extra={
                "batch_num": batch_num,
                "cursor_ts": cursor_created_at.isoformat(),
                "cursor_id": str(cursor_id),
                "total_encrypted": total_encrypted,
                "total_dl_failures": total_dl_failures,
            })

    finally:
        # D40: Structured JSON exit log
        summary = {
            "script": "migrate_evening_notes",
            "total_encrypted": total_encrypted,
            "total_skipped": total_skipped,
            "total_errors": total_errors,
            "total_dl_failures": total_dl_failures,
            "batches": batch_num,
            "final_cursor_ts": cursor_created_at.isoformat(),
            "final_cursor_id": str(cursor_id),
        }
        logger.info("migration_exit_summary", extra={"summary": json.dumps(summary)})


if __name__ == "__main__":
    asyncio.run(migrate_evening_notes())
```

---

## 3. Reverse Migration — `reverse_migrate_evening_notes.py`

```python
# scripts/reverse_migrate_evening_notes.py
# Used during rollback. Decrypts all encrypted rows back to plaintext.

import json
import asyncio
import logging
from uuid import UUID
from datetime import datetime, timezone

import sqlalchemy as sa
from app.database import AsyncSessionLocal
from app.core.encryption import decrypt_field_versioned
from scripts._dl_utils import _write_dead_letter

logger = logging.getLogger(__name__)

BATCH_SIZE = 500
DL_ABORT_THRESHOLD = 3


async def reverse_migrate_evening_notes():
    """
    Decrypts all encrypted evening_note values back to plaintext.
    I2: OCC guard. I23: Cursor only advances after DL confirmation.
    """
    cursor_created_at = datetime.min.replace(tzinfo=timezone.utc)
    cursor_id = UUID("00000000-0000-0000-0000-000000000000")

    total_decrypted = 0
    total_skipped = 0
    total_errors = 0
    total_dl_failures = 0
    batch_num = 0

    try:
        while True:
            batch_num += 1
            consecutive_dl_failures = 0

            async with AsyncSessionLocal() as db:
                rows = (await db.execute(sa.text("""
                    SELECT id, created_at, evening_note_ciphertext
                    FROM daily_logs
                    WHERE evening_note_encrypted = true
                      AND evening_note_ciphertext IS NOT NULL
                      AND (created_at, id) > (:cursor_ts, :cursor_id)
                    ORDER BY created_at, id
                    LIMIT :batch_size
                """), {
                    "cursor_ts": cursor_created_at,
                    "cursor_id": str(cursor_id),
                    "batch_size": BATCH_SIZE,
                })).fetchall()

                if not rows:
                    break

                for row in rows:
                    row_id, row_created_at, ciphertext_raw = row

                    try:
                        # D7: Normalize memoryview → bytes → str
                        ct = ciphertext_raw
                        if isinstance(ct, memoryview):
                            ct = ct.tobytes()
                        if isinstance(ct, bytes):
                            ct = ct.decode("utf-8")

                        plaintext = decrypt_field_versioned(ct)

                        # I2: OCC — match current encrypted state
                        result = await db.execute(sa.text("""
                            UPDATE daily_logs
                            SET evening_note = :plaintext,
                                evening_note_encrypted = false,
                                evening_note_ciphertext = NULL
                            WHERE id = :id
                              AND evening_note_encrypted = true
                        """), {
                            "plaintext": plaintext,
                            "id": str(row_id),
                        })

                        if result.rowcount == 0:
                            total_skipped += 1
                            logger.warning("reverse_occ_skip", extra={
                                "row_id": str(row_id),
                            })
                        else:
                            total_decrypted += 1

                        cursor_created_at = row_created_at
                        cursor_id = row_id

                    except Exception as exc:
                        total_errors += 1
                        dl_ok = await _write_dead_letter(
                            source_table="daily_logs",
                            source_row_id=str(row_id),
                            operation="decrypt",
                            error_message=str(exc),
                        )
                        if dl_ok:
                            cursor_created_at = row_created_at
                            cursor_id = row_id
                            consecutive_dl_failures = 0
                        else:
                            total_dl_failures += 1
                            consecutive_dl_failures += 1
                            if consecutive_dl_failures >= DL_ABORT_THRESHOLD:
                                raise RuntimeError(
                                    f"Aborting: {DL_ABORT_THRESHOLD} consecutive "
                                    f"DL write failures in batch {batch_num}"
                                )

                # Cursor advanced per-row; commit at batch boundary
                await db.commit()

            logger.info("reverse_batch_complete", extra={
                "batch_num": batch_num,
                "total_decrypted": total_decrypted,
            })

    finally:
        summary = {
            "script": "reverse_migrate_evening_notes",
            "total_decrypted": total_decrypted,
            "total_skipped": total_skipped,
            "total_errors": total_errors,
            "total_dl_failures": total_dl_failures,
            "batches": batch_num,
            "final_cursor_ts": cursor_created_at.isoformat(),
            "final_cursor_id": str(cursor_id),
        }
        logger.info("reverse_exit_summary", extra={"summary": json.dumps(summary)})


if __name__ == "__main__":
    asyncio.run(reverse_migrate_evening_notes())
```

---

## 4. Re-Encryption — `reencrypt_evening_notes.py`

```python
# scripts/reencrypt_evening_notes.py
# D29: Snapshot ACTIVE_KEY_VERSION at start. Frozen for entire job.

import json
import asyncio
import logging
from uuid import UUID
from datetime import datetime, timezone

import sqlalchemy as sa
from app.database import AsyncSessionLocal
from app.core.encryption import decrypt_field_versioned, encrypt_field_versioned
from app.config import settings
from scripts._dl_utils import _write_dead_letter

logger = logging.getLogger(__name__)

BATCH_SIZE = 500
DL_ABORT_THRESHOLD = 3


async def reencrypt_evening_notes():
    """
    Re-encrypts all encrypted rows to the current ACTIVE_KEY_VERSION.
    D29: Key version snapshotted at job start.
    """
    if not settings.ENCRYPTION_ACTIVE:
        raise RuntimeError("ENCRYPTION_ACTIVE must be true for re-encryption")
    if not settings.CRON_MAINTENANCE_MODE:
        raise RuntimeError("CRON_MAINTENANCE_MODE must be true during re-encryption")

    # D29: Freeze version for entire job
    target_version = settings.ACTIVE_KEY_VERSION
    target_prefix = f"v{target_version}:"

    cursor_created_at = datetime.min.replace(tzinfo=timezone.utc)
    cursor_id = UUID("00000000-0000-0000-0000-000000000000")

    total_reencrypted = 0
    total_skipped = 0
    total_errors = 0
    total_dl_failures = 0
    batch_num = 0

    try:
        while True:
            batch_num += 1
            consecutive_dl_failures = 0

            async with AsyncSessionLocal() as db:
                rows = (await db.execute(sa.text("""
                    SELECT id, created_at, evening_note_ciphertext
                    FROM daily_logs
                    WHERE evening_note_encrypted = true
                      AND evening_note_ciphertext IS NOT NULL
                      AND (created_at, id) > (:cursor_ts, :cursor_id)
                    ORDER BY created_at, id
                    LIMIT :batch_size
                """), {
                    "cursor_ts": cursor_created_at,
                    "cursor_id": str(cursor_id),
                    "batch_size": BATCH_SIZE,
                })).fetchall()

                if not rows:
                    break

                for row in rows:
                    row_id, row_created_at, ciphertext_raw = row

                    try:
                        ct = ciphertext_raw
                        if isinstance(ct, memoryview):
                            ct = ct.tobytes()
                        if isinstance(ct, bytes):
                            ct = ct.decode("utf-8")

                        # Skip if already on target version
                        if ct.startswith(target_prefix):
                            total_skipped += 1
                            cursor_created_at = row_created_at
                            cursor_id = row_id
                            continue

                        plaintext = decrypt_field_versioned(ct)
                        new_ciphertext = encrypt_field_versioned(
                            plaintext, force_version=target_version
                        )

                        # I2: OCC — match current encrypted state + boolean guard
                        result = await db.execute(sa.text("""
                            UPDATE daily_logs
                            SET evening_note_ciphertext = :new_ct
                            WHERE id = :id
                              AND evening_note_encrypted = true
                              AND evening_note_ciphertext = :original_ct
                        """), {
                            "new_ct": new_ciphertext.encode("utf-8"),
                            "id": str(row_id),
                            "original_ct": ciphertext_raw,
                        })

                        if result.rowcount == 0:
                            total_skipped += 1
                            logger.warning("reencrypt_occ_skip", extra={
                                "row_id": str(row_id),
                            })
                        else:
                            total_reencrypted += 1

                        cursor_created_at = row_created_at
                        cursor_id = row_id

                    except Exception as exc:
                        total_errors += 1
                        dl_ok = await _write_dead_letter(
                            source_table="daily_logs",
                            source_row_id=str(row_id),
                            operation="reencrypt",
                            error_message=str(exc),
                        )
                        if dl_ok:
                            cursor_created_at = row_created_at
                            cursor_id = row_id
                            consecutive_dl_failures = 0
                        else:
                            total_dl_failures += 1
                            consecutive_dl_failures += 1
                            if consecutive_dl_failures >= DL_ABORT_THRESHOLD:
                                raise RuntimeError(
                                    f"Aborting: {DL_ABORT_THRESHOLD} consecutive "
                                    f"DL write failures in batch {batch_num}"
                                )

                await db.commit()

            logger.info("reencrypt_batch_complete", extra={
                "batch_num": batch_num,
                "target_version": target_version,
                "total_reencrypted": total_reencrypted,
            })

    finally:
        summary = {
            "script": "reencrypt_evening_notes",
            "target_version": target_version,
            "total_reencrypted": total_reencrypted,
            "total_skipped": total_skipped,
            "total_errors": total_errors,
            "total_dl_failures": total_dl_failures,
            "batches": batch_num,
            "final_cursor_ts": cursor_created_at.isoformat(),
            "final_cursor_id": str(cursor_id),
        }
        logger.info("reencrypt_exit_summary", extra={"summary": json.dumps(summary)})


if __name__ == "__main__":
    asyncio.run(reencrypt_evening_notes())
```

---

## 5. Dead-Letter Resolution — `resolve_dead_letters.py`

```python
# scripts/resolve_dead_letters.py
# I24, D29, D39: Dispatch table, per-row guard, snapshot key version.

import json
import sys
import asyncio
import logging
from datetime import datetime, timezone

import sqlalchemy as sa
from app.database import AsyncSessionLocal
from app.core.encryption import (
    encrypt_field_versioned,
    decrypt_field_versioned,
)
from app.config import settings

logger = logging.getLogger(__name__)

BATCH_SIZE = 500


# ── Dispatch Handlers ──────────────────────────────────────────────

async def _handle_encrypt(db, row_id: str, target_version: int) -> bool:
    """
    D39: Per-row guard. If ENCRYPTION_ACTIVE=false, auto-resolve
    (row stays plaintext). If active, re-encrypt the row.
    """
    if not settings.ENCRYPTION_ACTIVE:
        # Rollback mode: row should stay plaintext. Auto-resolve.
        logger.info("encrypt_dl_auto_resolved_inactive", extra={
            "row_id": row_id,
        })
        return True

    row = (await db.execute(sa.text("""
        SELECT evening_note, evening_note_encrypted
        FROM daily_logs WHERE id = :id
    """), {"id": row_id})).fetchone()

    if row is None:
        return True  # Row deleted — resolve
    if row.evening_note_encrypted:
        return True  # Already encrypted — resolve

    if row.evening_note is None:
        return True  # NULL note — nothing to encrypt

    ciphertext = encrypt_field_versioned(row.evening_note, force_version=target_version)
    result = await db.execute(sa.text("""
        UPDATE daily_logs
        SET evening_note_ciphertext = :ct,
            evening_note_encrypted = true,
            evening_note = NULL
        WHERE id = :id AND evening_note_encrypted = false
    """), {
        "ct": ciphertext.encode("utf-8"),
        "id": row_id,
    })
    return result.rowcount >= 0  # 0 = OCC skip, still resolved


async def _handle_decrypt(db, row_id: str, _target_version: int) -> bool:
    """Decrypt a row back to plaintext. Used during rollback DL resolution."""
    row = (await db.execute(sa.text("""
        SELECT evening_note_ciphertext, evening_note_encrypted
        FROM daily_logs WHERE id = :id
    """), {"id": row_id})).fetchone()

    if row is None:
        return True
    if not row.evening_note_encrypted:
        return True  # Already plaintext

    ct = row.evening_note_ciphertext
    if ct is None:
        return True

    if isinstance(ct, memoryview):
        ct = ct.tobytes()
    if isinstance(ct, bytes):
        ct = ct.decode("utf-8")

    plaintext = decrypt_field_versioned(ct)
    await db.execute(sa.text("""
        UPDATE daily_logs
        SET evening_note = :plaintext,
            evening_note_encrypted = false,
            evening_note_ciphertext = NULL
        WHERE id = :id AND evening_note_encrypted = true
    """), {"plaintext": plaintext, "id": row_id})
    return True


async def _handle_reencrypt(db, row_id: str, target_version: int) -> bool:
    """Re-encrypt a row to target version."""
    row = (await db.execute(sa.text("""
        SELECT evening_note_ciphertext, evening_note_encrypted
        FROM daily_logs WHERE id = :id
    """), {"id": row_id})).fetchone()

    if row is None:
        return True
    if not row.evening_note_encrypted or row.evening_note_ciphertext is None:
        return True

    ct = row.evening_note_ciphertext
    if isinstance(ct, memoryview):
        ct = ct.tobytes()
    if isinstance(ct, bytes):
        ct = ct.decode("utf-8")

    plaintext = decrypt_field_versioned(ct)
    new_ct = encrypt_field_versioned(plaintext, force_version=target_version)

    await db.execute(sa.text("""
        UPDATE daily_logs
        SET evening_note_ciphertext = :new_ct
        WHERE id = :id AND evening_note_encrypted = true
    """), {"new_ct": new_ct.encode("utf-8"), "id": row_id})
    return True


# I24: Dispatch table for all operation types
_DISPATCH = {
    "encrypt": _handle_encrypt,
    "decrypt": _handle_decrypt,
    "reencrypt": _handle_reencrypt,
}


# ── Main Resolution Loop ──────────────────────────────────────────

async def resolve_dead_letters(operation_filter: str = None):
    """
    Resolves unresolved dead-letter entries by re-attempting the operation.
    D29: Snapshots ACTIVE_KEY_VERSION at start.
    I24: Dispatches to per-operation handler.
    """
    target_version = settings.ACTIVE_KEY_VERSION  # D29: Frozen for job

    total_resolved = 0
    total_errors = 0
    batch_num = 0

    op_clause = ""
    params = {"batch_size": BATCH_SIZE}
    if operation_filter:
        if operation_filter not in _DISPATCH:
            raise ValueError(f"Unknown operation: {operation_filter}")
        op_clause = "AND operation = :op_filter"
        params["op_filter"] = operation_filter

    try:
        while True:
            batch_num += 1

            async with AsyncSessionLocal() as db:
                entries = (await db.execute(sa.text(f"""
                    SELECT id, source_row_id, operation, error_message
                    FROM encryption_dead_letters
                    WHERE source_table = 'daily_logs'
                      AND resolved_at IS NULL
                      {op_clause}
                    ORDER BY created_at, id
                    LIMIT :batch_size
                """), params)).fetchall()

                if not entries:
                    break

                for entry in entries:
                    dl_id, source_row_id, operation, _error = entry

                    handler = _DISPATCH.get(operation)
                    if handler is None:
                        logger.error("unknown_dl_operation", extra={
                            "dl_id": str(dl_id),
                            "operation": operation,
                        })
                        total_errors += 1
                        continue

                    try:
                        # SAVEPOINT per row (within shared batch session)
                        async with db.begin_nested():
                            success = await handler(db, str(source_row_id), target_version)

                        if success:
                            await db.execute(sa.text("""
                                UPDATE encryption_dead_letters
                                SET resolved_at = :now
                                WHERE id = :id
                            """), {
                                "now": datetime.now(timezone.utc),
                                "id": str(dl_id),
                            })
                            total_resolved += 1

                    except Exception as exc:
                        total_errors += 1
                        logger.error("dl_resolution_failed", extra={
                            "dl_id": str(dl_id),
                            "operation": operation,
                            "error": str(exc)[:500],
                        })

                await db.commit()

            logger.info("resolve_batch_complete", extra={
                "batch_num": batch_num,
                "total_resolved": total_resolved,
            })

    finally:
        summary = {
            "script": "resolve_dead_letters",
            "operation_filter": operation_filter,
            "target_version": target_version,
            "total_resolved": total_resolved,
            "total_errors": total_errors,
            "batches": batch_num,
        }
        logger.info("resolve_exit_summary", extra={"summary": json.dumps(summary)})


if __name__ == "__main__":
    op_filter = sys.argv[1] if len(sys.argv) > 1 else None
    asyncio.run(resolve_dead_letters(op_filter))
```

---

## 6. Script Cross-Reference

| Script | Invariants | Decisions | Key Behavior |
|--------|-----------|-----------|--------------|
| `_dl_utils._write_dead_letter` | I22, I23, I25 | D31, D32, D35 | Dedicated pool, bool return, upsert |
| `migrate_evening_notes` | I2, I7-I10, I17, I20, I25 | D11, D12, D20, D40 | Forward encrypt, circuit breaker, batch-boundary DL reset |
| `reverse_migrate_evening_notes` | I2, I7, I17, I23 | D7, D12, D40 | Decrypt to plaintext, OCC skip + cursor advance |
| `reencrypt_evening_notes` | I2, I7, I17, I23 | D7, D12, D29, D40 | Version rotation, snapshot key, OCC skip |
| `resolve_dead_letters` | I24, I14 | D29, D39, D40 | Dispatch table, per-row encrypt guard, SAVEPOINT per row |
