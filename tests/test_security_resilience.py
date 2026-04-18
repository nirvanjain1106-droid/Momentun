import pytest
from datetime import date, timedelta
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.services import task_service, checkin_service

@pytest.mark.asyncio
async def test_user_a_cannot_access_user_b_goal(
    async_client: AsyncClient,
    test_db: AsyncSession,
    setup_test_user,
    setup_second_user,
):
    """Verify IDOR protection for Goal retrieval."""
    user_a, token_a = setup_test_user
    user_b, token_b = setup_second_user

    # User B creates a goal via API
    # Must be in the future
    future_date = (date.today() + timedelta(days=365)).isoformat()
    goal_payload = {
        "title": "User B Wealth Goal",
        "goal_type": "exam",
        "target_date": future_date,
        "motivation": "Secret stuff"
    }
    headers_b = {"Authorization": f"Bearer {token_b}"}
    resp_b = await async_client.post("/api/v1/goals", headers=headers_b, json=goal_payload)
    assert resp_b.status_code == 201
    goal_b_id = resp_b.json()["id"]

    # User A tries to GET User B's goal
    headers_a = {"Authorization": f"Bearer {token_a}"}
    response = await async_client.get(f"/api/v1/goals/{goal_b_id}", headers=headers_a)
    
    # Assert 404 (Hides existence/Ownership breach)
    assert response.status_code == 404
    assert response.json()["detail"] == "Goal not found"


@pytest.mark.asyncio
async def test_user_a_cannot_update_user_b_goal(
    async_client: AsyncClient,
    test_db: AsyncSession,
    setup_test_user,
    setup_second_user,
):
    """Verify IDOR protection for Goal updates."""
    user_a, token_a = setup_test_user
    user_b, token_b = setup_second_user

    # 2. Create a Goal
    # Use tomorrow's date to pass validation
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    goal_payload = {
        "title": "Beat the Flu",
        "goal_type": "fitness",
        "target_date": tomorrow
    }
    headers_b = {"Authorization": f"Bearer {token_b}"}
    resp_goal = await async_client.post("/api/v1/goals", headers=headers_b, json=goal_payload)
    if resp_goal.status_code != 201:
        print(f"Goal creation failed: {resp_goal.json()}")
    assert resp_goal.status_code == 201
    goal_b_id = resp_goal.json()["id"]

    # User A tries to RENAME User B's goal
    headers_a = {"Authorization": f"Bearer {token_a}"}
    payload = {"title": "Hacked Title"}
    response = await async_client.put(f"/api/v1/goals/{goal_b_id}", headers=headers_a, json=payload)
    
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_user_a_cannot_complete_user_b_task(
    async_client: AsyncClient,
    test_db: AsyncSession,
    setup_test_user,
    setup_second_user,
):
    """Verify IDOR protection for Task completion."""
    _user_a, token_a = setup_test_user
    _user_b, token_b = setup_second_user

    # User B creates a task via quick-add (needs no goal)
    payload_b = {
        "title": "User B Secret Task",
        "duration_mins": 30,
        "goal_id": None
    }
    headers_b = {"Authorization": f"Bearer {token_b}"}
    resp_b = await async_client.post(
        "/api/v1/tasks/quick-add", 
        headers=headers_b, 
        json=payload_b
    )
    if resp_b.status_code != 201:
        print(f"Quick-add 422: {resp_b.json()}")
    assert resp_b.status_code == 201
    task_b_id = resp_b.json()["id"]

    # User A tries to COMPLETE User B's task
    headers_a = {"Authorization": f"Bearer {token_a}"}
    payload = {"actual_duration_mins": 30, "quality_rating": 5}
    response = await async_client.post(f"/api/v1/tasks/{task_b_id}/complete", headers=headers_a, json=payload)
    
    assert response.status_code == 404
    assert response.json()["detail"] == "Task not found"


@pytest.mark.asyncio
async def test_pii_redaction_audit_task_logs(mocker, test_db, setup_test_user):
    """Verify that task services do NOT log plaintext titles (PII Redaction Audit)."""
    user, token = setup_test_user
    
    # Mock the logger in task_service
    mock_logger = mocker.patch("app.services.task_service.logger")
    
    # Action: Quick add a task with a very specific recognizable title
    pii_title = "MY SECRET BANKING PASSWORD 123"
    await task_service.quick_add_task(
        user_id=user.id,
        title=pii_title,
        duration_mins=30,
        goal_id=None,
        db=test_db
    )
    
    # Verify logger.info was called
    assert mock_logger.info.called
    
    # Audit log calls: None should contain the plaintext pii_title
    for call in mock_logger.info.call_args_list:
        args, kwargs = call
        # Check 'extra' dict in kwargs
        extra = kwargs.get("extra", {})
        for val in extra.values():
            assert pii_title not in str(val), f"PII Leak detected in logs: {pii_title} found in {extra}"
        
        # Check the message itself
        msg = args[0] if args else ""
        assert pii_title not in msg

@pytest.mark.asyncio
async def test_pii_redaction_checkin_logs(mocker, test_db, setup_test_user):
    """Verify that checkin services do NOT log plaintext notes (PII Redaction Audit)."""
    user, _token = setup_test_user
    
    # Mock the logger in checkin_service
    mock_logger = mocker.patch("app.services.checkin_service.logger")
    
    # We need a schema request
    from app.schemas.checkin import MorningCheckinRequest
    data = MorningCheckinRequest(
        morning_energy="high",
        yesterday_rating="crushed_it",
        surprise_event=None,
        surprise_note="VERY CONFIDENTIAL SURPRISE NOTE"
    )
    
    await checkin_service.morning_checkin(user, data, test_db)
    
    # Audit
    for call in mock_logger.info.call_args_list:
        args, kwargs = call
        extra = kwargs.get("extra", {})
        for val in extra.values():
            assert "VERY CONFIDENTIAL" not in str(val)
        msg = args[0] if args else ""
        assert "VERY CONFIDENTIAL" not in msg
