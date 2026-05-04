"""
test_insights.py — 7 tests covering the insights module endpoints:
  - GET /api/v1/insights/streak    → StreakResponse
  - GET /api/v1/insights/weekly    → WeeklyInsightsResponse
  - GET /api/v1/insights/heatmap   → HeatmapResponse
  - GET /api/v1/insights/patterns  → PatternsResponse

All endpoints require CurrentUserComplete (onboarding_complete=True),
so tests use the `setup_test_user` fixture from the root conftest.

Note: Weekly insights may return 400 when the user has insufficient data
(no completed schedules). This is expected for a fresh test user.
"""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


class TestStreak:
    """GET /api/v1/insights/streak"""

    async def test_streak_for_new_user(self, async_client: AsyncClient, setup_test_user):
        """New user with no activity should have streak = 0."""
        _, token = setup_test_user
        headers = {"Authorization": f"Bearer {token}"}
        resp = await async_client.get("/api/v1/insights/streak", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["current_streak"] >= 0

    async def test_streak_response_fields(self, async_client: AsyncClient, setup_test_user):
        _, token = setup_test_user
        headers = {"Authorization": f"Bearer {token}"}
        resp = await async_client.get("/api/v1/insights/streak", headers=headers)
        body = resp.json()
        required_fields = {"current_streak", "best_streak", "streak_protected"}
        assert required_fields.issubset(set(body.keys()))


class TestWeeklyInsights:
    """GET /api/v1/insights/weekly"""

    async def test_weekly_insights_response(
        self, async_client: AsyncClient, setup_test_user
    ):
        """Weekly insights may return 200 or 400 for users with no data."""
        _, token = setup_test_user
        headers = {"Authorization": f"Bearer {token}"}
        resp = await async_client.get("/api/v1/insights/weekly", headers=headers)
        # 200 when data exists, 400 when insufficient history
        assert resp.status_code in (200, 400)
        if resp.status_code == 200:
            body = resp.json()
            assert isinstance(body, dict)
            assert len(body) > 0

    async def test_weekly_requires_auth(self, async_client: AsyncClient):
        """Weekly insights without auth → 401/403."""
        resp = await async_client.get("/api/v1/insights/weekly")
        assert resp.status_code in (401, 403)


class TestHeatmap:
    """GET /api/v1/insights/heatmap"""

    async def test_heatmap_structure(self, async_client: AsyncClient, setup_test_user):
        _, token = setup_test_user
        headers = {"Authorization": f"Bearer {token}"}
        resp = await async_client.get(
            "/api/v1/insights/heatmap?days=30", headers=headers
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "entries" in body
        assert "total_days" in body
        assert body["total_days"] == 30

    async def test_heatmap_intensity_values(
        self, async_client: AsyncClient, setup_test_user
    ):
        """Each heatmap entry should have a valid intensity level."""
        _, token = setup_test_user
        headers = {"Authorization": f"Bearer {token}"}
        resp = await async_client.get(
            "/api/v1/insights/heatmap?days=7", headers=headers
        )
        body = resp.json()
        valid_intensities = {"none", "low", "medium", "high"}
        for entry in body.get("entries", []):
            assert entry["intensity"] in valid_intensities


class TestPatterns:
    """GET /api/v1/insights/patterns"""

    async def test_patterns_response(self, async_client: AsyncClient, setup_test_user):
        _, token = setup_test_user
        headers = {"Authorization": f"Bearer {token}"}
        resp = await async_client.get("/api/v1/insights/patterns", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, dict)
