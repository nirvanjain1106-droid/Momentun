import pytest
from datetime import date
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.goal import Task, Schedule

@pytest.mark.asyncio
async def test_create_adhoc_task_no_schedule(
    async_client: AsyncClient,
    setup_test_user: tuple,
    test_db: AsyncSession,
):
    """Test creating an ad-hoc task when no schedule exists for today."""
    user, token = setup_test_user
    auth_headers = {"Authorization": f"Bearer {token}"}
    
    payload = {
        "title": "Unplanned meeting",
        "duration_mins": 45,
        "energy_required": "high",
        "priority": 2,
    }
    response = await async_client.post(
        "/api/v1/tasks/ad-hoc",
        json=payload,
        headers=auth_headers
    )
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Unplanned meeting"
    assert data["task_status"] == "parked"
    assert data["goal_id"] is None

@pytest.mark.asyncio
async def test_create_adhoc_task_with_gap(
    async_client: AsyncClient,
    setup_test_user: tuple,
    test_db: AsyncSession,
):
    """Test creating an ad-hoc task and fitting it into a gap."""
    user, token = setup_test_user
    auth_headers = {"Authorization": f"Bearer {token}"}
    
    # 1. Create a schedule for today with a large gap
    today = date.today()
    schedule = Schedule(
        user_id=user.id,
        schedule_date=today,
        day_type="standard"
    )
    test_db.add(schedule)
    await test_db.flush()

    existing_task = Task(
        user_id=user.id,
        schedule_id=schedule.id,
        title="Existing Task",
        task_type="general",
        duration_mins=60,
        energy_required="high",
        priority=1,
        scheduled_start="09:00",
        scheduled_end="10:00",
        task_status="active",
        sequence_order=0
    )
    test_db.add(existing_task)
    await test_db.flush()
    await test_db.commit()

    # 2. Add ad-hoc task that should fit after 10:10 (10 min buffer)
    payload = {
        "title": "Ad-hoc task",
        "duration_mins": 30,
        "energy_required": "medium",
        "priority": 2,
    }
    response = await async_client.post(
        "/api/v1/tasks/ad-hoc",
        json=payload,
        headers=auth_headers
    )
    assert response.status_code == 201
    data = response.json()
    # Depending on solver logic, it should find a gap
    assert data["task_status"] == "active"
    assert data["scheduled_start"] is not None
    assert data["goal_id"] is None
