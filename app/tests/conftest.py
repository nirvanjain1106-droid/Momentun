"""
Shared test fixtures for app/tests/ — imports the production-grade Postgres
testcontainers infrastructure from tests/conftest.py so that all fixtures
(db_engine, test_db, async_client, db_cleanup, setup_test_user, etc.) are
available in this directory.

Additional fixtures here add auth-oriented helpers for endpoint-level
integration tests.
"""

import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient

# ═══════════════════════════════════════════════════════════════════
# RE-EXPORT ALL ROOT CONFTEST FIXTURES
# ═══════════════════════════════════════════════════════════════════
# Pytest only discovers conftest.py by walking UP the directory tree.
# Since app/tests/ is inside app/, the tests/conftest.py (a sibling
# directory) is not auto-discovered.  We explicitly import every
# fixture so pytest registers them in this scope.

from tests.conftest import (          # noqa: F401 — re-export for pytest
    db_engine,
    test_db,
    db_cleanup,
    app_instance,
    async_client,
    use_latency_proxy,
    setup_test_user,
    setup_second_user,
    redis_client,
    make_user,
    make_goal,
    FakeDB,
)


# ═══════════════════════════════════════════════════════════════════
# APP-TESTS SPECIFIC FIXTURES
# ═══════════════════════════════════════════════════════════════════

TEST_USER_PASSWORD = "TestPass1!"


@pytest.fixture
def test_user_data():
    """Return a dict of valid registration fields reusable across tests."""
    return {
        "name": "Suite User",
        "email": f"suite_{uuid.uuid4().hex[:8]}@momentum.com",
        "password": TEST_USER_PASSWORD,
        "user_type": "student",
    }


@pytest_asyncio.fixture
async def registered_user(async_client: AsyncClient, test_user_data: dict):
    """Register a user via the API and return (user_data_dict, response_json)."""
    resp = await async_client.post("/api/v1/auth/register", json=test_user_data)
    assert resp.status_code == 201, f"Registration failed: {resp.text}"
    return test_user_data, resp.json()


@pytest_asyncio.fixture
async def authenticated_client(async_client: AsyncClient, test_user_data: dict):
    """
    Register + login via the API, then set the Bearer header on the client.
    Returns (client_with_auth_header, user_response_json).
    """
    reg_resp = await async_client.post("/api/v1/auth/register", json=test_user_data)
    assert reg_resp.status_code == 201, f"Registration failed: {reg_resp.text}"
    reg_data = reg_resp.json()

    access_token = reg_data["access_token"]
    async_client.headers["Authorization"] = f"Bearer {access_token}"
    return async_client, reg_data


@pytest_asyncio.fixture
async def second_authenticated_client(async_client: AsyncClient):
    """
    A second authenticated user for IDOR / cross-user tests.
    Returns (client_with_auth, user_response_json).
    """
    payload = {
        "name": "Second User",
        "email": f"second_{uuid.uuid4().hex[:8]}@momentum.com",
        "password": TEST_USER_PASSWORD,
        "user_type": "student",
    }
    reg = await async_client.post("/api/v1/auth/register", json=payload)
    assert reg.status_code == 201
    data = reg.json()
    async_client.headers["Authorization"] = f"Bearer {data['access_token']}"
    return async_client, data
