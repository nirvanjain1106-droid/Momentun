import sqlalchemy as sa
from typing import Optional
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.database import AsyncSessionLocal
from app.config import settings

router = APIRouter()

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


async def _cache_column_check():
    """Called from app lifespan — NOT registered on router."""
    global _encryption_columns_present
    _encryption_columns_present = await _check_encryption_columns()


@router.get("/health", include_in_schema=False)
async def health_check():
    """
    D37: Returns cached encryption_columns_present.
    Lazy retry if startup check failed (DB was down at boot).
    Does NOT block pod boot if DB unavailable.
    """
    global _encryption_columns_present
    if _encryption_columns_present in (None, False):
        _encryption_columns_present = await _check_encryption_columns()

    try:
        async with AsyncSessionLocal() as db:
            await db.execute(sa.text("SELECT 1"))
        db_status = "connected"
        status_code = 200
    except Exception:
        db_status = "unreachable"
        status_code = 503

    return JSONResponse(
        status_code=status_code,
        content={
            "status": "healthy" if status_code == 200 else "unhealthy",
            "db": db_status,
            "code_version": 17,
            "encryption_active": settings.ENCRYPTION_ACTIVE,
            "encryption_columns_present": _encryption_columns_present or False,
        }
    )
