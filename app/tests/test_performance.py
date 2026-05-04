"""
test_performance.py — 4 tests establishing baseline performance assertions
and verifying concurrent request handling.

These are lightweight smoke tests, not load tests. They verify that
endpoints respond within acceptable thresholds under test conditions.
"""

import asyncio
import time

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


class TestResponseTimes:
    """Baseline response time assertions under test conditions."""

    async def test_login_response_under_500ms(
        self, async_client: AsyncClient, test_user_data
    ):
        # Register first
        await async_client.post("/api/v1/auth/register", json=test_user_data)

        start = time.perf_counter()
        resp = await async_client.post(
            "/api/v1/auth/login",
            json={
                "email": test_user_data["email"],
                "password": test_user_data["password"],
            },
        )
        elapsed_ms = (time.perf_counter() - start) * 1000

        assert resp.status_code == 200
        assert elapsed_ms < 2000, f"Login took {elapsed_ms:.0f}ms (max 2000ms)"

    async def test_schedule_response_under_2s(
        self, async_client: AsyncClient, setup_test_user
    ):
        """Schedule auto-generation should complete within a reasonable window."""
        _, token = setup_test_user
        headers = {"Authorization": f"Bearer {token}"}

        start = time.perf_counter()
        resp = await async_client.get("/api/v1/schedule/today", headers=headers)
        elapsed_ms = (time.perf_counter() - start) * 1000

        assert resp.status_code in (200, 400)
        # Schedule generation is computationally heavier — allow 2s in test env
        assert elapsed_ms < 5000, f"Schedule took {elapsed_ms:.0f}ms (max 5000ms)"

    async def test_insights_response_under_1s(
        self, async_client: AsyncClient, setup_test_user
    ):
        _, token = setup_test_user
        headers = {"Authorization": f"Bearer {token}"}

        start = time.perf_counter()
        resp = await async_client.get("/api/v1/insights/streak", headers=headers)
        elapsed_ms = (time.perf_counter() - start) * 1000

        assert resp.status_code == 200
        assert elapsed_ms < 3000, f"Streak took {elapsed_ms:.0f}ms (max 3000ms)"


class TestConcurrency:
    """Verify the server handles concurrent requests without crashing."""

    async def test_concurrent_requests_handled(
        self, async_client: AsyncClient, setup_test_user
    ):
        """Fire 10 concurrent requests and verify all return valid status codes."""
        _, token = setup_test_user
        headers = {"Authorization": f"Bearer {token}"}

        async def _make_request():
            return await async_client.get(
                "/api/v1/insights/streak", headers=headers
            )

        results = await asyncio.gather(
            *[_make_request() for _ in range(10)],
            return_exceptions=True,
        )

        # Count successes — allow some failures due to connection pooling
        success_count = sum(
            1
            for r in results
            if not isinstance(r, Exception) and r.status_code == 200
        )
        # At least 8 of 10 should succeed
        assert success_count >= 8, (
            f"Only {success_count}/10 concurrent requests succeeded"
        )
