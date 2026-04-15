"""Tests for schedule service — Commit 3 multi-goal logic.

11 tests covering:
- Horizon line: not expired before end, during grace, expired after grace
- Horizon line edge cases: malformed time, non-today schedule
- Cross-day cleanup: expires past tasks, no-op for empty
- Stale regen: returns stale when locked, force-releases old lock
- Task generation: exam and fitness goal types
"""

import uuid
import pytest
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch, AsyncMock

from tests.conftest import make_user, FakeDB
from app.services import schedule_service as schedule_mod


# ── Time mocking helper ─────────────────────────────────────


def _make_frozen_datetime(year, month, day, hour, minute, tz_name="Asia/Kolkata"):
    """Create a datetime subclass that freezes now() to a specific time."""
    try:
        from zoneinfo import ZoneInfo
    except ImportError:
        from backports.zoneinfo import ZoneInfo

    from datetime import datetime as real_dt

    frozen = real_dt(year, month, day, hour, minute, tzinfo=ZoneInfo(tz_name))

    class FrozenDT(real_dt):
        @classmethod
        def now(cls, tz=None):
            if tz:
                return frozen.astimezone(tz)
            return frozen.replace(tzinfo=None)

    return FrozenDT


# ── 1. Horizon line: not expired before end ──────────────────


@pytest.mark.asyncio
async def test_horizon_line_not_expired_before_end():
    """Task ending at 15:00 — at 14:59, should NOT be expired."""
    FrozenDT = _make_frozen_datetime(2026, 4, 16, 14, 59)

    task = SimpleNamespace(
        scheduled_end="15:00",
        task_status="active",
        previous_status=None,
    )
    schedule = SimpleNamespace(
        id=uuid.uuid4(),
        schedule_date=date(2026, 4, 16),
    )
    db = FakeDB(select_results=[[task]])

    original_dt = schedule_mod.datetime
    schedule_mod.datetime = FrozenDT
    try:
        await schedule_mod._apply_horizon_line(uuid.uuid4(), schedule, "Asia/Kolkata", db)
    finally:
        schedule_mod.datetime = original_dt

    assert task.task_status == "active"


# ── 2. Horizon line: not expired during grace window ────────


@pytest.mark.asyncio
async def test_horizon_line_not_expired_during_grace():
    """Task ending at 15:00 — at 15:14, within grace window, should NOT be expired."""
    FrozenDT = _make_frozen_datetime(2026, 4, 16, 15, 14)

    task = SimpleNamespace(
        scheduled_end="15:00",
        task_status="active",
        previous_status=None,
    )
    schedule = SimpleNamespace(
        id=uuid.uuid4(),
        schedule_date=date(2026, 4, 16),
    )
    db = FakeDB(select_results=[[task]])

    original_dt = schedule_mod.datetime
    schedule_mod.datetime = FrozenDT
    try:
        await schedule_mod._apply_horizon_line(uuid.uuid4(), schedule, "Asia/Kolkata", db)
    finally:
        schedule_mod.datetime = original_dt

    assert task.task_status == "active"


# ── 3. Horizon line: expired after grace ─────────────────────


@pytest.mark.asyncio
async def test_horizon_line_expires_after_grace():
    """Task ending at 15:00 — at 15:16, past grace window, SHOULD be expired."""
    FrozenDT = _make_frozen_datetime(2026, 4, 16, 15, 16)

    task = SimpleNamespace(
        scheduled_end="15:00",
        task_status="active",
        previous_status=None,
    )
    schedule = SimpleNamespace(
        id=uuid.uuid4(),
        schedule_date=date(2026, 4, 16),
    )
    db = FakeDB(select_results=[[task]])

    original_dt = schedule_mod.datetime
    schedule_mod.datetime = FrozenDT
    try:
        await schedule_mod._apply_horizon_line(uuid.uuid4(), schedule, "Asia/Kolkata", db)
    finally:
        schedule_mod.datetime = original_dt

    assert task.task_status == "expired"
    assert task.previous_status == "active"


# ── 4. Cross-day cleanup: expires past tasks ────────────────


@pytest.mark.asyncio
async def test_cross_day_cleanup_expires_past_tasks():
    """Active tasks from yesterday's schedule should be expired."""
    task = SimpleNamespace(
        task_status="active",
        previous_status=None,
    )
    db = FakeDB(select_results=[[task]])

    await schedule_mod._cross_day_cleanup(uuid.uuid4(), date.today(), db)

    assert task.task_status == "expired"
    assert task.previous_status == "active"


# ── 5. Cross-day cleanup: no-op for empty ───────────────────


@pytest.mark.asyncio
async def test_cross_day_cleanup_noop_no_past():
    """No past active tasks → 0 expired, no crash."""
    db = FakeDB(select_results=[[]])

    # Should complete without error
    await schedule_mod._cross_day_cleanup(uuid.uuid4(), date.today(), db)
    # No assertions needed — just verify it doesn't crash


# ── 6. Stale regen: returns stale when actively regenerating ─


@pytest.mark.asyncio
async def test_stale_regen_returns_stale_when_locked():
    """If is_regenerating=True and within timeout → return stale schedule as-is."""
    schedule = SimpleNamespace(
        id=uuid.uuid4(),
        is_stale=True,
        is_regenerating=True,
        regeneration_started_at=datetime.now(timezone.utc) - timedelta(seconds=30),
    )
    user = make_user()
    db = FakeDB()  # No results needed — returns immediately

    result = await schedule_mod._handle_stale_schedule(user, schedule, date.today(), db)

    assert result is schedule
    assert schedule.is_regenerating is True  # NOT released — still in progress


# ── 7. Stale regen: force-releases old lock ──────────────────


@pytest.mark.asyncio
async def test_stale_regen_force_releases_old_lock():
    """Lock older than REGEN_LOCK_TIMEOUT_SECS is force-released."""
    schedule = SimpleNamespace(
        id=uuid.uuid4(),
        is_stale=True,
        is_regenerating=True,
        regeneration_started_at=datetime.now(timezone.utc) - timedelta(seconds=300),
        deleted_at=None,
        user_id=uuid.uuid4(),
    )
    user = make_user()

    db = FakeDB(select_results=[
        [],    # tasks to defer (empty)
    ])

    # Mock generate_schedule to prevent deep call chain — it will raise,
    # which triggers the except block that releases the lock
    with patch.object(schedule_mod, "generate_schedule", new_callable=AsyncMock, side_effect=Exception("mock")):
        await schedule_mod._handle_stale_schedule(user, schedule, date.today(), db)

    # After exception, lock should be released (via except block)
    assert schedule.is_regenerating is False
    assert schedule.regeneration_started_at is None
    assert schedule.deleted_at is None  # Un-deleted on failure


# ── 8. Horizon line: malformed time skipped ──────────────────


@pytest.mark.asyncio
async def test_horizon_line_malformed_time():
    """Malformed scheduled_end doesn't crash — task is skipped."""
    FrozenDT = _make_frozen_datetime(2026, 4, 16, 20, 0)

    good_task = SimpleNamespace(
        scheduled_end="15:00",
        task_status="active",
        previous_status=None,
    )
    bad_task = SimpleNamespace(
        scheduled_end="garbage",
        task_status="active",
        previous_status=None,
    )
    schedule = SimpleNamespace(
        id=uuid.uuid4(),
        schedule_date=date(2026, 4, 16),
    )
    db = FakeDB(select_results=[[good_task, bad_task]])

    original_dt = schedule_mod.datetime
    schedule_mod.datetime = FrozenDT
    try:
        await schedule_mod._apply_horizon_line(uuid.uuid4(), schedule, "Asia/Kolkata", db)
    finally:
        schedule_mod.datetime = original_dt

    # Good task expired (20:00 > 15:00 + 15min)
    assert good_task.task_status == "expired"
    # Bad task skipped (ValueError caught), remains active
    assert bad_task.task_status == "active"


# ── 9. Horizon line: skips non-today ─────────────────────────


@pytest.mark.asyncio
async def test_horizon_line_skips_non_today():
    """If schedule_date != today, horizon line is a no-op."""
    FrozenDT = _make_frozen_datetime(2026, 4, 16, 20, 0)

    task = SimpleNamespace(
        scheduled_end="15:00",
        task_status="active",
        previous_status=None,
    )
    schedule = SimpleNamespace(
        id=uuid.uuid4(),
        schedule_date=date(2026, 4, 15),  # Yesterday
    )
    # No DB results needed — function returns early
    db = FakeDB()

    original_dt = schedule_mod.datetime
    schedule_mod.datetime = FrozenDT
    try:
        await schedule_mod._apply_horizon_line(uuid.uuid4(), schedule, "Asia/Kolkata", db)
    finally:
        schedule_mod.datetime = original_dt

    # Task not touched — function returned before querying
    assert task.task_status == "active"


# ── 10. Task generation: exam goal ───────────────────────────


def test_generate_task_requirements_exam():
    """Exam goal generates tasks with deep_study type and correct priorities."""
    from tests.conftest import make_goal
    from app.services.constraint_solver import PRIORITY_CORE

    goal = make_goal(goal_type="exam")
    behavioural = SimpleNamespace(daily_commitment_hrs=4.0)

    tasks = schedule_mod._generate_task_requirements(goal, behavioural)

    assert len(tasks) > 0
    task_types = {t.task_type for t in tasks}
    assert "deep_study" in task_types
    # Weak subject should be Core priority
    core_tasks = [t for t in tasks if t.priority == PRIORITY_CORE]
    assert len(core_tasks) > 0


# ── 11. Task generation: fitness goal ────────────────────────


def test_generate_task_requirements_fitness():
    """Fitness goal generates exercise-related tasks."""
    from tests.conftest import make_goal

    goal = make_goal(
        goal_type="fitness",
        goal_metadata={
            "workout_types": ["cardio", "strength"],
            "sessions_per_week": 4,
        },
    )
    behavioural = SimpleNamespace(daily_commitment_hrs=2.0)

    tasks = schedule_mod._generate_task_requirements(goal, behavioural)

    # Should generate at least 1 task
    assert len(tasks) >= 1
