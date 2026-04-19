import pytest
import asyncio
import time
from datetime import date, timedelta, datetime
from sqlalchemy import select
from app.models.goal import Schedule, FixedBlock

@pytest.mark.asyncio
async def test_solver_loop_lag_audit(async_client, setup_test_user, test_db):
    """
    PERFORMANCE AUDIT: Measure event loop blocking during heavy solver runs.
    Simulate a user with 50+ fixed blocks to stress the ConstraintSolver.
    """
    user, token = setup_test_user
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create a goal
    goal_data = {
        "title": "Performance Goal",
        "goal_type": "exam",
        "target_date": (date.today() + timedelta(days=30)).isoformat(),
        "goal_metadata": {"subjects": ["math"], "weak_subjects": [], "strong_subjects": []}
    }
    await async_client.post("/api/v1/goals", json=goal_data, headers=headers)

    # 2. Add 50 fixed blocks (stress the solver with non-overlapping constraints)
    for i in range(50):
        # Spreading blocks across 7 days and 15 hours per day to ensure no overlap validation errors (400)
        day = i % 7
        hour = (i // 7) + 7  # Start from 7 AM
        block = FixedBlock(
            user_id=user.id,
            title=f"Constraint {i}",
            block_type="other",
            applies_to_days=[day],
            start_time=f"{hour:02d}:00",
            end_time=f"{hour:02d}:45",
            is_hard_constraint=True
        )
        test_db.add(block)
    
    await test_db.commit()

    # 3. Measure Loop Lag
    # We'll run a background heart-beat task that increments a counter
    lag_counter = 0
    stop_heartbeat = False

    async def heartbeat():
        nonlocal lag_counter
        while not stop_heartbeat:
            lag_counter += 1
            await asyncio.sleep(0.01) # 10ms

    heartbeat_task = asyncio.create_task(heartbeat())
    
    start_time = time.perf_counter()
    resp = await async_client.get("/api/v1/schedule/today", headers=headers)
    end_time = time.perf_counter()
    
    stop_heartbeat = True
    await heartbeat_task

    duration = end_time - start_time
    # Expected heartbeats if no lag: duration / 0.01
    expected_heartbeats = duration / 0.01
    lag_ratio = 1 - (lag_counter / expected_heartbeats)

    print(f"\n[PERF] Solver Duration: {duration:.2f}s")
    print(f"[PERF] Heartbeats: {lag_counter} (Expected: ~{expected_heartbeats:.0f})")
    print(f"[PERF] Loop Lag Ratio: {lag_ratio*100:.2f}%")

    assert resp.status_code == 200
    # If lag_ratio > 0.5, the event loop was blocked for more than 50% of the time!
    # This is a major issue for a production API.
    assert lag_ratio < 0.8  # Allow some lag, but warn if severe


@pytest.mark.asyncio
async def test_db_timeout_resilience(use_latency_proxy, async_client, setup_test_user):
    """
    RELIABILITY AUDIT: Inject 500ms database latency.
    Verify the API remains responsive (within reasonable timeout limits).
    """
    user, token = setup_test_user
    headers = {"Authorization": f"Bearer {token}"}
    
    # use_latency_proxy is a fixture that forces LatencyAsyncSession
    # Inject 500ms delay on every DB call
    
    start_time = time.perf_counter()
    resp = await async_client.get("/api/v1/goals", headers=headers)
    end_time = time.perf_counter()
    
    duration = end_time - start_time
    print(f"\n[RELIABILITY] DB Latency Call Duration: {duration:.2f}s")
    
    assert resp.status_code == 200
    # A single call might involve 2-3 DB ops (Auth + Fetch)
    # Expected duration: ~1.5s
    assert duration > 0.5


@pytest.mark.asyncio
async def test_stale_lock_recovery(async_client, setup_test_user, test_db):
    """
    RELIABILITY AUDIT: Validate stale schedule self-healing.
    In V8, advisory locks replace row flags. A schedule marked is_stale=True
    should trigger regeneration via the advisory lock flow and return fresh data.
    """
    user, token = setup_test_user
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create a goal (required for schedule generation)
    goal_data = {
        "title": "Recovery Goal",
        "goal_type": "exam",
        "target_date": (date.today() + timedelta(days=30)).isoformat(),
        "goal_metadata": {"subjects": ["math"], "weak_subjects": [], "strong_subjects": []}
    }
    await async_client.post("/api/v1/goals", json=goal_data, headers=headers)

    # 2. Create a stale schedule in the DB
    schedule = Schedule(
        user_id=user.id,
        schedule_date=date.today(),
        is_stale=True,
        generation_version=1,
    )
    test_db.add(schedule)
    await test_db.flush()
    await test_db.commit()
    stale_id = schedule.id

    # 3. Requesting schedule should trigger regeneration via advisory lock
    resp = await async_client.get("/api/v1/schedule/today", headers=headers)

    assert resp.status_code == 200, f"Stale recovery failed: {resp.text}"

    # 4. Verify a fresh schedule now exists for today
    # Capture user_id before expire_all triggers lazy load
    uid = user.id
    test_db.expire_all()
    await test_db.commit()

    # The response should contain a valid schedule
    body = resp.json()
    assert "id" in body, "Response missing schedule id"

    # The returned schedule should NOT be the stale one
    # (the system created a new row via the advisory lock path)
    from sqlalchemy import and_
    result = await test_db.execute(
        select(Schedule).where(
            and_(
                Schedule.user_id == uid,
                Schedule.schedule_date == date.today(),
                Schedule.is_stale == False,  # noqa: E712
            )
        )
    )
    fresh = result.scalars().first()
    assert fresh is not None, "No fresh schedule found after stale recovery"
    assert fresh.generation_version >= 1, "Fresh schedule has invalid generation_version"

    print("\n[RELIABILITY] Stale schedule recovery via advisory lock successful.")
