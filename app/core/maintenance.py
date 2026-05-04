"""
Database maintenance utilities — Sprint 7

P0#2 Fix: Partial index ``uq_task_per_rule_per_date`` breaks HOT updates when
``deleted_at`` transitions NULL→NOW(). This module provides a REINDEX
CONCURRENTLY task that should be scheduled monthly via cron/Airflow.

Usage:
    python -m app.core.maintenance

Or via cron:
    0 3 1 * * cd /app && python -m app.core.maintenance
"""

import asyncio
import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import settings

assert settings.DATABASE_URL is not None

logger = logging.getLogger(__name__)

# P0#2: Observability query — add to Grafana/Datadog dashboard.
# Alert if scan_efficiency_pct < 80%.
INDEX_BLOAT_CHECK_SQL = """
SELECT indexrelname,
       pg_size_pretty(pg_relation_size(indexrelid)) as size,
       round(100.0 * idx_scan / nullif(idx_tup_fetch + idx_scan, 0), 2)
           as scan_efficiency_pct
FROM pg_stat_user_indexes
WHERE indexrelname = 'uq_task_per_rule_per_date';
"""

REINDEX_SQL = "REINDEX INDEX CONCURRENTLY uq_task_per_rule_per_date;"


async def reindex_recurring_dedup() -> None:
    """REINDEX CONCURRENTLY the recurring task dedup index.

    Must be run outside a transaction block. Uses a raw connection
    with autocommit to satisfy PostgreSQL's CONCURRENTLY requirement.
    """
    # autocommit required for REINDEX CONCURRENTLY
    engine = create_async_engine(
        settings.DATABASE_URL,  # type: ignore[arg-type]
        isolation_level="AUTOCOMMIT",
    )
    async with engine.connect() as conn:
        logger.info("Starting REINDEX CONCURRENTLY uq_task_per_rule_per_date")
        await conn.execute(text(REINDEX_SQL))
        logger.info("REINDEX CONCURRENTLY completed successfully")

        # Report bloat stats
        result = await conn.execute(text(INDEX_BLOAT_CHECK_SQL))
        for row in result:
            logger.info(
                "Index bloat check: name=%s size=%s efficiency=%s%%",
                row[0], row[1], row[2],
            )

    await engine.dispose()


async def check_index_bloat() -> dict:
    """Return index bloat stats for monitoring dashboards."""
    from app.database import engine as app_engine

    async with app_engine.connect() as conn:
        result = await conn.execute(text(INDEX_BLOAT_CHECK_SQL))
        row = result.first()
        if row:
            return {
                "index_name": row[0],
                "size": row[1],
                "scan_efficiency_pct": float(row[2]) if row[2] else None,
            }
    return {"index_name": "uq_task_per_rule_per_date", "size": "N/A", "scan_efficiency_pct": None}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(reindex_recurring_dedup())
