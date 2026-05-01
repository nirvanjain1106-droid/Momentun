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
