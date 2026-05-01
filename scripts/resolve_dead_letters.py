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
          AND evening_note = :original_note
    """), {
        "ct": ciphertext,
        "id": row_id,
        "original_note": row.evening_note,
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

    # Defensive type guard (column is Text)
    if isinstance(ct, (memoryview, bytes)):
        ct = bytes(ct).decode("utf-8") if isinstance(ct, memoryview) else ct.decode("utf-8")

    plaintext = decrypt_field_versioned(ct)
    result = await db.execute(sa.text("""
        UPDATE daily_logs
        SET evening_note = :plaintext,
            evening_note_encrypted = false,
            evening_note_ciphertext = NULL
        WHERE id = :id AND evening_note_encrypted = true
          AND evening_note_ciphertext = :original_ct
    """), {
        "plaintext": plaintext, 
        "id": row_id,
        "original_ct": row.evening_note_ciphertext
    })
    return result.rowcount >= 0


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
    # Defensive type guard (column is Text)
    if isinstance(ct, (memoryview, bytes)):
        ct = bytes(ct).decode("utf-8") if isinstance(ct, memoryview) else ct.decode("utf-8")

    plaintext = decrypt_field_versioned(ct)
    new_ct = encrypt_field_versioned(plaintext, force_version=target_version)

    result = await db.execute(sa.text("""
        UPDATE daily_logs
        SET evening_note_ciphertext = :new_ct
        WHERE id = :id AND evening_note_encrypted = true
          AND evening_note_ciphertext = :original_ct
    """), {
        "new_ct": new_ct, 
        "id": row_id,
        "original_ct": row.evening_note_ciphertext
    })
    return result.rowcount >= 0


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

    from uuid import UUID
    cursor_created_at = datetime.min.replace(tzinfo=timezone.utc)
    cursor_id = UUID("00000000-0000-0000-0000-000000000000")

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
                params["cursor_ts"] = cursor_created_at
                params["cursor_id"] = str(cursor_id)
                entries = (await db.execute(sa.text(f"""
                    SELECT id, created_at, source_row_id, operation, error_message
                    FROM encryption_dead_letters
                    WHERE source_table = 'daily_logs'
                      AND resolved_at IS NULL
                      AND (created_at, id) > (:cursor_ts, :cursor_id)
                      {op_clause}
                    ORDER BY created_at, id
                    LIMIT :batch_size
                """), params)).fetchall()

                if not entries:
                    break

                for entry in entries:
                    dl_id, dl_created_at, source_row_id, operation, _error = entry

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
                    
                    cursor_created_at = dl_created_at
                    cursor_id = dl_id

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
