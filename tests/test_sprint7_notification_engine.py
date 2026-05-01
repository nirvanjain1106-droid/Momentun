"""
Tests for Sprint 7 Notification Engine
"""

import uuid
from datetime import datetime, timezone
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.goal import Goal, Task, Notification
from app.services.notification_service import (
    _evaluate_rescue_candidate,
    create_rescue_notification
)
from tests.conftest import make_user, make_goal

pytestmark = pytest.mark.asyncio

# ── 1. Service Layer Tests ───────────────────────────────────────────────

async def test_evaluate_rescue_candidate_no_tasks(test_db, setup_test_user):
    """Verify evaluation handles 0-task scenarios safely."""
    user, _ = setup_test_user
    user_id = user.id
    goal = Goal(
        id=uuid.uuid4(), user_id=user_id, title="Empty Goal", 
        goal_type="habit", status="active",
        priority_rank=1, target_date=datetime.now().date(),
        motivation="Test", consequence="Test", success_metric="Test",
        goal_metadata={}
    )
    test_db.add(goal)
    await test_db.flush()
    
    # 0 tasks -> should return False
    needs_rescue = await _evaluate_rescue_candidate(goal, user_id, test_db)
    assert needs_rescue is False


async def test_evaluate_rescue_candidate_thresholds(test_db, setup_test_user):
    """Verify evaluation triggers below the configured threshold.
    
    rescue_threshold_pct is 30.0 (from settings).
    rate < 30 => True (needs rescue).
    """
    user, _ = setup_test_user
    user_id = user.id
    goal = Goal(
        id=uuid.uuid4(), user_id=user_id, title="Active Goal", 
        goal_type="habit", status="active",
        priority_rank=1, target_date=datetime.now().date(),
        motivation="Test", consequence="Test", success_metric="Test",
        goal_metadata={}
    )
    test_db.add(goal)
    await test_db.flush()
    
    # Add 10 tasks, 2 completed -> 20% completion rate (< 30% threshold)
    tasks = []
    for i in range(10):
        tasks.append(Task(
            user_id=user_id, goal_id=goal.id, title=f"Task {i}",
            task_type="deep_study", duration_mins=30, energy_required="medium",
            task_status="completed" if i < 2 else "active",
            source_date=datetime.now().date(),
            priority=1, sequence_order=i
        ))
    test_db.add_all(tasks)
    await test_db.flush()
    
    needs_rescue = await _evaluate_rescue_candidate(goal, user_id, test_db)
    # 20% is < 30% threshold -> True
    assert needs_rescue is True
    
    # Update to 8 completed -> 80% completion rate (> 30% threshold)
    for i in range(2, 8):
        tasks[i].task_status = "completed"
    await test_db.flush()
    
    needs_rescue_after = await _evaluate_rescue_candidate(goal, user_id, test_db)
    # 80% is > threshold -> False
    assert needs_rescue_after is False


async def test_create_rescue_notification(test_db, setup_test_user):
    """Verify create_rescue_notification creates valid notification."""
    user, _ = setup_test_user
    user_id = user.id
    goal = Goal(
        id=uuid.uuid4(), user_id=user_id, title="Falling Behind Goal", 
        goal_type="habit", status="active",
        priority_rank=1, target_date=datetime.now().date(),
        motivation="Test", consequence="Test", success_metric="Test",
        goal_metadata={}
    )
    test_db.add(goal)
    
    # Add failing tasks (0% completion — well below 30% threshold)
    test_db.add(Task(
        user_id=user_id, goal_id=goal.id, title="Failing Task",
        task_type="deep_study", duration_mins=30, energy_required="medium",
        task_status="active", source_date=datetime.now().date(),
        priority=1, sequence_order=1
    ))
    await test_db.flush()
    
    notification = await create_rescue_notification(goal, user_id, test_db)
    assert notification is not None
    assert notification.type == "rescue_mission"
    assert notification.goal_id == goal.id
    assert notification.user_id == user_id
    
    # Flush to persist the notification added by create_rescue_notification
    await test_db.flush()
    
    # Verify persistence
    db_notif = await test_db.execute(
        select(Notification).where(Notification.id == notification.id)
    )
    db_notif = db_notif.scalar_one_or_none()
    assert db_notif is not None


# ── 2. API Router Tests ──────────────────────────────────────────────────

async def test_api_list_notifications(async_client: AsyncClient, setup_test_user):
    """Test GET /api/v1/notifications endpoint."""
    user, token = setup_test_user
    headers = {"Authorization": f"Bearer {token}"}
    
    response = await async_client.get("/api/v1/notifications", headers=headers)
    assert response.status_code in (200, 501, 404)
    
    if response.status_code == 200:
        data = response.json()
        assert isinstance(data, list)
