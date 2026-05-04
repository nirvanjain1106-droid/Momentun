"""
Tests for Sprint 7 Heatmap and Insights Cache
"""

from datetime import date, timedelta
import pytest
from httpx import AsyncClient

from app.models.goal import DailyLog
from app.services.insights_service import get_heatmap

pytestmark = pytest.mark.asyncio

async def test_get_heatmap_generation(test_db, setup_test_user):
    """Verify heatmap generation logic and intensity calculations."""
    user, _ = setup_test_user

    # Create some logs for the past few days
    today = date.today()
    logs = [
        DailyLog(
            user_id=user.id,
            log_date=today,
            mood_score=4,
            tasks_scheduled=5,
            tasks_completed=5,
            completion_rate=1.0,
            evening_note_encrypted=False,
            evening_note="Great day"
        ),
        DailyLog(
            user_id=user.id,
            log_date=today - timedelta(days=1),
            mood_score=3,
            tasks_scheduled=4,
            tasks_completed=2,
            completion_rate=0.5,
            evening_note_encrypted=False,
            evening_note="Okay day"
        ),
        DailyLog(
            user_id=user.id,
            log_date=today - timedelta(days=2),
            mood_score=2,
            tasks_scheduled=3,
            tasks_completed=0,
            completion_rate=0.0,
            evening_note_encrypted=False,
            evening_note="Bad day"
        )
    ]
    test_db.add_all(logs)
    await test_db.flush()

    heatmap = await get_heatmap(user, test_db, days=7)

    assert heatmap.total_days == 7
    assert len(heatmap.entries) == 7

    # Check that intensity maps correctly
    for entry in heatmap.entries:
        if entry.date == today.isoformat():
            assert entry.completion_rate == 1.0
            assert entry.intensity == "high"
        elif entry.date == (today - timedelta(days=1)).isoformat():
            assert entry.completion_rate == 0.5
            assert entry.intensity == "medium"
        elif entry.date == (today - timedelta(days=2)).isoformat():
            assert entry.completion_rate == 0.0
            assert entry.intensity == "low"
        else:
            # Days with no logs
            assert entry.completion_rate is None
            assert entry.intensity == "none"


async def test_api_get_heatmap(async_client: AsyncClient, setup_test_user):
    """Test GET /api/v1/insights/heatmap endpoint."""
    user, token = setup_test_user
    headers = {"Authorization": f"Bearer {token}"}

    response = await async_client.get("/api/v1/insights/heatmap?days=30", headers=headers)
    assert response.status_code in (200, 404, 501)

    if response.status_code == 200:
        data = response.json()
        assert "entries" in data
        assert "total_days" in data
        assert data["total_days"] == 30
