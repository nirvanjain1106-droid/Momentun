import pytest
import asyncio
import uuid
from httpx import AsyncClient
from app.models.goal import Schedule, Goal, DailyLog
from app.services.schedule_service import _pii_hash
from sqlalchemy import select

@pytest.mark.asyncio
async def test_concurrency_race_condition(async_client, setup_test_user, test_db):
    """
    CHAOS TEST: Fire 20 simultaneous schedule generation requests.
    Verify atomicity — strictly one schedule record should exist in DB,
    and all requests should return 200 (using the existing one on collision).
    """
    user, token = setup_test_user
    headers = {"Authorization": f"Bearer {token}"}

    # MUST create a goal first or scheduler returns 400
    from datetime import date, timedelta
    goal_data = {
        "title": "Concurrency Goal",
        "goal_type": "exam",
        "target_date": (date.today() + timedelta(days=30)).isoformat(),
        "goal_metadata": {"subjects": ["math"], "weak_subjects": [], "strong_subjects": []}
    }
    g_resp = await async_client.post("/api/v1/goals", json=goal_data, headers=headers)
    assert g_resp.status_code == 201

    # Fire 20 concurrent requests
    tasks = [
        async_client.get("/api/v1/schedule/today", headers=headers)
        for _ in range(20)
    ]
    
    responses = await asyncio.gather(*tasks)

    # All should succeed
    for resp in responses:
        assert resp.status_code == 200, f"Request failed: {resp.text}"

    # Verify strictly one schedule exists in DB
    # We must use a clean session or refresh to see reality
    await test_db.commit() # Flush everything to DB
    
    result = await test_db.execute(
        select(Schedule).where(Schedule.user_id == user.id)
    )
    schedules = result.scalars().all()
    assert len(schedules) == 1, f"Expected 1 schedule, found {len(schedules)}"


@pytest.mark.asyncio
async def test_llm_provider_failover(async_client, setup_test_user, test_db, mocker):
    """
    RESILLIENCE TEST: Mock LLM providers to timeout or return 500.
    Verify system falls back to build_fallback_enrichment without error.
    """
    user, token = setup_test_user
    headers = {"Authorization": f"Bearer {token}"}
    
    # Create a goal first (required for schedule)
    from datetime import date, timedelta
    goal_data = {
        "title": "Chaos Goal",
        "goal_type": "exam",
        "target_date": (date.today() + timedelta(days=30)).isoformat(),
        "goal_metadata": {"subjects": ["math"], "weak_subjects": [], "strong_subjects": []}
    }
    await async_client.post("/api/v1/goals", json=goal_data, headers=headers)

    # Mock call_llm to return None (simulating failure)
    mocker.patch("app.services.schedule_service.call_llm", return_value=None)
    
    # Request schedule with LLM enabled
    resp = await async_client.get("/api/v1/schedule/today?use_llm=true", headers=headers)
    assert resp.status_code == 200
    
    data = resp.json()
    assert "strategy_note" in data
    # Fallback enrichment uses generic notes
    assert "stay consistent" in data["strategy_note"].lower() or "recovery" in data["strategy_note"].lower()


@pytest.mark.asyncio
async def test_idor_cross_user_task_access(async_client, setup_test_user, setup_second_user, test_db):
    """
    SECURITY TEST: Verify User A cannot view User B's task details even with a valid ID.
    """
    user1, token1 = setup_test_user
    user2, token2 = setup_second_user
    headers1 = {"Authorization": f"Bearer {token1}"}

    # User 2 creates a goal and schedule
    from datetime import date
    from app.models.goal import Task, Goal, Schedule
    
    g2 = Goal(id=uuid.uuid4(), user_id=user2.id, title="Secret Goal", goal_type="exam", target_date=date.today())
    # Schedule must exist for tasks
    s2 = Schedule(id=uuid.uuid4(), user_id=user2.id, schedule_date=date.today())
    
    t2 = Task(
        id=uuid.uuid4(), user_id=user2.id, goal_id=g2.id, schedule_id=s2.id, 
        title="Secret Task", task_status="active", task_type="deep_study",
        duration_mins=60, energy_required="high", priority=1, sequence_order=1
    )
    
    test_db.add(g2)
    test_db.add(s2)
    test_db.add(t2)
    await test_db.flush()
    await test_db.commit()

    # User 1 tries to access User 2's task
    resp = await async_client.get(f"/api/v1/tasks/{t2.id}", headers=headers1)
    
    # Verify strict isolation
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_pii_log_redaction(setup_test_user, test_db, caplog):
    """
    SECURITY TEST: Verify that service-layer logs never contain raw task titles.
    They must be hashed via _pii_hash.
    """
    import logging
    from app.services.schedule_service import _check_block_overlaps
    from app.models.goal import FixedBlock
    
    user, _ = setup_test_user
    
    # Create overlapping fixed blocks
    fb1 = FixedBlock(title="Secret Meeting", start_time="09:00", end_time="11:00", user_id=user.id)
    fb2 = FixedBlock(title="Sensitive Talk", start_time="10:00", end_time="12:00", user_id=user.id)
    
    # Trigger the overlap warning log
    with caplog.at_level(logging.WARNING):
        _check_block_overlaps([fb1, fb2])
    
    # Verify that the message itself is clean
    assert "Secret Meeting" not in caplog.text
    assert "Sensitive Talk" not in caplog.text
    
    # Verify the hash is present in the record's extra attributes
    found = False
    for record in caplog.records:
        if record.msg == "fixed_block_overlap_detected":
            expected_hash = _pii_hash("Secret Meeting")
            if getattr(record, "block_1_hash", None) == expected_hash:
                found = True
                break
    assert found, "Expected PII hash not found in log extras"
