"""Sprint 7 fast-fail gate — must pass before any schema changes land."""

import pytest
from sqlalchemy import text

from app.main import app


# ── TEST 1: Router prefix audit ──────────────────────────────────────

def test_router_prefix_api_v1():
    """Every Sprint 7 router must be mounted under /api/v1."""

    sprint7_tags = {"notifications", "recurring-rules", "milestones"}

    registered_tags: set[str] = set()
    routes = getattr(app.router, "routes", [])

    for route in routes:
        if hasattr(route, "tags") and route.tags:
            for tag in route.tags:
                if tag in sprint7_tags:
                    registered_tags.add(tag)

    if not registered_tags:
        pytest.xfail("router not yet registered")

    for route in routes:
        if hasattr(route, "tags") and route.tags:
            for tag in route.tags:
                if tag in sprint7_tags:
                    assert route.path.startswith(
                        "/api/v1"
                    ), f"Route with tag {tag} path '{route.path}' does not start with /api/v1"


# ── TEST 2: _parse_time pre-check ────────────────────────────────────

def test_parse_time_pre_check():
    """_parse_time must handle valid, malformed, and None inputs correctly."""

    try:
        from app.services.schedule_service import _parse_time
    except ImportError:
        pytest.skip("_parse_time not yet implemented")

    from datetime import time

    assert _parse_time("14:30") == time(14, 30)

    with pytest.raises(ValueError):
        _parse_time("ab:cd")

    with pytest.raises(ValueError):
        _parse_time(None)


# ── TEST 3: DB session isolation level ───────────────────────────────

@pytest.mark.asyncio
async def test_db_session_isolation_level(db_engine):
    """Default transaction isolation must be 'read committed'."""

    async with db_engine.connect() as conn:
        result = await conn.execute(
            text("SELECT current_setting('transaction_isolation')")
        )
        isolation = result.scalar()

    assert isolation.lower() == "read committed", (
        f"Expected 'read committed', got {isolation!r}"
    )
