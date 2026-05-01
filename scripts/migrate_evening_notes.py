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
    consecutive_dl_failures = 0
    batch_num = 0

    try:
        while True:
            batch_num += 1

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
                            "ciphertext": ciphertext,
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
