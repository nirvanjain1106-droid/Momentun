"""Backend E2E: Full-day simulation (The 'Sick Day Surge')."""

import pytest
from datetime import date
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

@pytest.mark.asyncio
async def test_full_day_flow_sick_day(
    async_client: AsyncClient,
    test_db: AsyncSession,
    setup_test_user,
    mocker,
):
    """
    Simulate a full user journey.
    Mocks fixed blocks to bypass SQLite ARRAY.contains() incompatibility.
    """
    mocker.patch("app.services.schedule_service._get_fixed_blocks_for_date", return_value=[])

    user, token = setup_test_user
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create a Goal
    from datetime import timedelta
    goal_data = {
        "title": "Master FastAPI",
        "goal_type": "exam",
        "description": "Building a high-performance API",
        "target_date": (date.today() + timedelta(days=365)).isoformat(),
        "motivation": "Career growth",
    }
    resp = await async_client.post("/api/v1/goals", headers=headers, json=goal_data)
    if resp.status_code == 422:
        pytest.fail(f"Goal 422 Detail: {resp.text}")
    assert resp.status_code == 201, resp.text
    resp.json()["id"]

    # 2. Morning Checkin ('sick')
    checkin_data = {
        "morning_energy": "low",
        "yesterday_rating": "decent",
        "surprise_event": "sick",
        "surprise_note": "Fever starting"
    }
    resp = await async_client.post("/api/v1/checkin/morning", headers=headers, json=checkin_data)
    if resp.status_code == 422:
        print(f"Morning Checkin 422: {resp.json()}")
    assert resp.status_code == 201
    assert resp.json()["day_type_assigned"] == "minimum_viable"

    # 3. Verify Schedule and Tasks
    resp = await async_client.get("/api/v1/schedule/today", headers=headers)
    assert resp.status_code == 200
    schedule_data = resp.json()
    tasks = schedule_data["tasks"]
    assert len(tasks) > 0
    # On sick days, solver should have picked only essential tasks
    
    # 4. Complete 1 Task
    task_id = tasks[0]["id"]
    complete_data = {"actual_duration_mins": 30, "quality_rating": 4}
    resp = await async_client.post(f"/api/v1/tasks/{task_id}/complete", headers=headers, json=complete_data)
    assert resp.status_code == 200

    # 5. Evening Review
    # We must submit ALL tasks from the schedule
    completions = []
    for t in tasks:
        if t["id"] == task_id:
            completions.append({"task_id": t["id"], "status": "completed", "actual_duration_mins": 30, "quality_rating": 4})
        else:
            completions.append({"task_id": t["id"], "status": "skipped", "skip_reason": "sick"})
            
    review_data = {
        "task_completions": completions,
        "mood_score": 2,
        "evening_note": "Survived the day"
    }
    resp = await async_client.post("/api/v1/checkin/evening", headers=headers, json=review_data)
    if resp.status_code == 422:
        pytest.fail(f"Evening Review 422 Detail: {resp.text}")
    assert resp.status_code == 201
    
    # 6. Verify DailyLog stats (Insights)
    assert resp.json()["tasks_completed"] == 1
    assert resp.json()["completion_rate"] > 0
    
    # Check if the streak is still alive (minimal check)
    resp = await async_client.get("/api/v1/insights/streak", headers=headers)
    assert resp.status_code == 200
    # Streak should be at least 1 since we completed a task today
    assert resp.json()["current_streak"] >= 1
