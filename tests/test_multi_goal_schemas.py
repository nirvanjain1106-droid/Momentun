"""Regression tests for Commit 3 schema changes.

3 tests covering:
- TaskResponse serializes with new goal fields
- GoalDetailResponse includes rank fields
- GoalReorderRequest validates correctly
"""

import uuid
from datetime import date


# ── 1. TaskResponse with new fields ─────────────────────────


def test_task_response_new_fields():
    """TaskResponse accepts goal_id and goal_rank_snapshot (both optional)."""
    from app.schemas.schedule import TaskResponse

    # With goal fields set
    resp = TaskResponse(
        id=uuid.uuid4(),
        title="Test Task",
        description="A test task",
        task_type="deep_study",
        duration_mins=60,
        scheduled_start="09:00",
        scheduled_end="10:00",
        energy_required="medium",
        priority=1,
        priority_label="Core",
        is_mvp_task=True,
        sequence_order=1,
        task_status="active",
        goal_id=uuid.uuid4(),
        goal_rank_snapshot=2,
    )
    assert resp.goal_id is not None
    assert resp.goal_rank_snapshot == 2

    # Without goal fields (None defaults)
    resp_none = TaskResponse(
        id=uuid.uuid4(),
        title="Test Task",
        description=None,
        task_type="deep_study",
        duration_mins=60,
        scheduled_start="09:00",
        scheduled_end="10:00",
        energy_required="medium",
        priority=1,
        priority_label="Core",
        is_mvp_task=True,
        sequence_order=1,
        task_status="active",
    )
    assert resp_none.goal_id is None
    assert resp_none.goal_rank_snapshot is None


# ── 2. GoalDetailResponse includes rank fields ──────────────


def test_goal_detail_response_rank_fields():
    """GoalDetailResponse includes priority_rank and pre_pause_rank."""
    from app.schemas.goals import GoalDetailResponse

    resp = GoalDetailResponse(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        title="Test Goal",
        goal_type="exam",
        description=None,
        target_date=date.today(),
        motivation=None,
        consequence=None,
        success_metric=None,
        status="active",
        progress_pct=50.0,
        tasks_completed=5,
        tasks_total=10,
        days_remaining=30,
        priority_rank=1,
        pre_pause_rank=None,
    )
    assert resp.priority_rank == 1
    assert resp.pre_pause_rank is None

    # Paused goal with pre_pause_rank
    resp_paused = GoalDetailResponse(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        title="Paused Goal",
        goal_type="exam",
        description=None,
        target_date=date.today(),
        motivation=None,
        consequence=None,
        success_metric=None,
        status="paused",
        progress_pct=30.0,
        tasks_completed=3,
        tasks_total=10,
        days_remaining=30,
        priority_rank=None,
        pre_pause_rank=2,
    )
    assert resp_paused.priority_rank is None
    assert resp_paused.pre_pause_rank == 2


# ── 3. GoalReorderRequest validation ────────────────────────


def test_goal_reorder_request_validation():
    """GoalReorderRequest accepts a list of UUIDs."""
    from app.schemas.goals import GoalReorderRequest

    ids = [uuid.uuid4(), uuid.uuid4(), uuid.uuid4()]
    req = GoalReorderRequest(goal_ids=ids)
    assert len(req.goal_ids) == 3
    assert req.goal_ids == ids
