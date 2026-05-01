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
    consecutive_dl_failures = 0
    batch_num = 0

    try:
        while True:
            batch_num += 1

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
                        # D7: Defensive type guard (column is Text, but handle edge cases)
                        ct = ciphertext_raw
                        if isinstance(ct, (memoryview, bytes)):
                            ct = bytes(ct).decode("utf-8") if isinstance(ct, memoryview) else ct.decode("utf-8")

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
