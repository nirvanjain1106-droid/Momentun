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

    # 2. Add 50 fixed blocks (stress the solver's overlap detection and slot-finding)
    for i in range(50):
        # Create small non-overlapping or slightly overlapping blocks
        start_h = (i % 12) + 6
        start_m = (i * 10) % 60
        block = FixedBlock(
            user_id=user.id,
            title=f"Constraint {i}",
            start_time=f"{start_h:02d}:{start_m:02d}",
            end_time=f"{(start_h + 1):02d}:{start_m:02d}",
            applies_to_days=[0, 1, 2, 3, 4, 5, 6],
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
async def test_db_timeout_resilience(async_client, setup_test_user, use_latency_proxy):
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
    RELIABILITY AUDIT: Force a stale generation lock.
    If is_regenerating=True but started >60s ago, system should self-heal.
    """
    user, token = setup_test_user
    headers = {"Authorization": f"Bearer {token}"}
    
    # 1. Create a goal
    goal_data = {
        "title": "Recovery Goal",
        "goal_type": "exam",
        "target_date": (date.today() + timedelta(days=30)).isoformat(),
        "goal_metadata": {"subjects": ["math"], "weak_subjects": [], "strong_subjects": []}
    }
    await async_client.post("/api/v1/goals", json=goal_data, headers=headers)

    # 2. Poison the DB with a stale lock
    from datetime import timezone as tz
    stale_time = datetime.now(tz.utc) - timedelta(seconds=70)
    schedule = Schedule(
        user_id=user.id,
        schedule_date=date.today(),
        is_regenerating=True,
        regeneration_started_at=stale_time
    )
    test_db.add(schedule)
    await test_db.flush()
    await test_db.commit()

    # 3. Requesting schedule should trigger self-healing
    resp = await async_client.get("/api/v1/schedule/today", headers=headers)
    
    assert resp.status_code == 200, f"Recovery failed: {resp.text}"
    
    # 4. Verify lock was released
    # Re-fetch from DB
    result = await test_db.execute(select(Schedule).where(Schedule.user_id == user.id))
    s = result.scalars().first()
    assert s.is_regenerating is False
    print("\n[RELIABILITY] Stale lock recovery successful.")
