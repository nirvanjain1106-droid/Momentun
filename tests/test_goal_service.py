"""Tests for the Goal Service — Commit 3 multi-goal rank management.

12 tests covering:
- Rank compaction on pause
- Resume assigns bottom rank
- Resume fails at MAX_ACTIVE_GOALS cap
- Reorder uses negative temp ranks (not NULL)
- pre_pause_rank stored on pause
- Reorder rejects wrong IDs
- Reorder rejects partial list
- Double-pause rejected
- Resume from achieved rejected
- Compact ranks idempotent
- Abandon nulls rank + sets deleted_at
- Stale marking sets schedule flag
"""

import uuid
import pytest

from types import SimpleNamespace
from tests.conftest import make_goal, FakeDB

from app.services import goal_service as goal_mod


# ── Helpers ──────────────────────────────────────────────────

# FakeDB stacking:
#   update_goal_status does these executes in order:
#     1. _get_user_goal → goal
#     [then depending on transition:]
#     For active→paused: _compact_ranks → [goals], _mark_today → schedule/None
#     For paused→active: _count_active → int, _next_rank → int, _mark_today → schedule/None
#     Finally: _build_goal_response → _get_goal_progress (2× scalar)
#   Total varies by transition.


def _progress_results():
    """Standard stacked results for _get_goal_progress: total=5, completed=3."""
    return [5, 3]


# ── 1. Rank compaction on pause ──────────────────────────────


@pytest.mark.asyncio
async def test_rank_compaction_on_pause():
    """Pausing rank-1 goal compacts ranks: 2→1, 3→2."""
    user_id = uuid.uuid4()
    goal_1 = make_goal(user_id=user_id, status="active", priority_rank=1)
    goal_2 = make_goal(user_id=user_id, status="active", priority_rank=2)
    goal_3 = make_goal(user_id=user_id, status="active", priority_rank=3)

    db = FakeDB(select_results=[
        goal_1,              # 1. _get_user_goal
        [goal_2, goal_3],    # 2. _compact_ranks (remaining active goals)
        None,                # 3. _mark_today_schedule_stale (no schedule)
        *_progress_results(),  # 4-5. _get_goal_progress
    ])

    await goal_mod.update_goal_status(user_id, goal_1.id, "paused", db)

    # Goal 1: paused with rank cleared
    assert goal_1.status == "paused"
    assert goal_1.priority_rank is None
    assert goal_1.pre_pause_rank == 1

    # Remaining goals: compacted
    assert goal_2.priority_rank == 1
    assert goal_3.priority_rank == 2


# ── 2. Resume assigns bottom rank ───────────────────────────


@pytest.mark.asyncio
async def test_resume_assigns_bottom_rank():
    """Resuming a paused goal assigns max(rank)+1."""
    user_id = uuid.uuid4()
    paused_goal = make_goal(user_id=user_id, status="paused", pre_pause_rank=1)

    db = FakeDB(select_results=[
        paused_goal,         # 1. _get_user_goal
        2,                   # 2. _count_active_goals → 2 exist
        2,                   # 3. _next_rank → max rank is 2, returns 3
        None,                # 4. _mark_today_schedule_stale
        *_progress_results(),  # 5-6. _get_goal_progress
    ])

    await goal_mod.update_goal_status(user_id, paused_goal.id, "active", db)

    assert paused_goal.status == "active"
    assert paused_goal.priority_rank == 3  # bottom rank


# ── 3. Resume fails at max cap ──────────────────────────────


@pytest.mark.asyncio
async def test_resume_fails_at_max_goals():
    """Resume with 3 active goals returns 409 Conflict."""
    user_id = uuid.uuid4()
    paused_goal = make_goal(user_id=user_id, status="paused")

    db = FakeDB(select_results=[
        paused_goal,  # 1. _get_user_goal
        3,            # 2. _count_active_goals → at max (3)
    ])

    with pytest.raises(Exception) as exc_info:
        await goal_mod.update_goal_status(user_id, paused_goal.id, "active", db)

    assert exc_info.value.status_code == 409


# ── 4. Reorder uses negative temp ranks ─────────────────────


@pytest.mark.asyncio
async def test_reorder_goals_negative_temps():
    """Full reorder uses negative temp ranks, not NULL (avoids CHECK violation)."""
    user_id = uuid.uuid4()
    goal_a = make_goal(user_id=user_id, status="active", priority_rank=1)
    goal_b = make_goal(user_id=user_id, status="active", priority_rank=2)

    # Track intermediate flush states to verify negative ranks
    flush_snapshots = []
    db = FakeDB(select_results=[
        [goal_a, goal_b],        # 1. SELECT active goals FOR UPDATE
        None,                    # 2. _mark_today_schedule_stale
        [goal_a, goal_b],        # 3. list_all_goals → SELECT goals
        *_progress_results(),    # 4-5. _get_goal_progress for first goal
        *_progress_results(),    # 6-7. _get_goal_progress for second goal
    ])

    original_flush = db.flush

    async def recording_flush():
        flush_snapshots.append({
            "a_rank": goal_a.priority_rank,
            "b_rank": goal_b.priority_rank,
        })
        await original_flush()

    db.flush = recording_flush

    # Reorder: swap a and b
    await goal_mod.reorder_goals(
        user_id,
        [goal_b.id, goal_a.id],  # b first, a second
        db,
    )

    # Verify negative temps were used in the FIRST flush (snapshot 0)
    assert flush_snapshots[0]["a_rank"] < 0, "Goal A should have negative temp rank"
    assert flush_snapshots[0]["b_rank"] < 0, "Goal B should have negative temp rank"

    # Verify final ranks are correct
    assert goal_b.priority_rank == 1
    assert goal_a.priority_rank == 2


# ── 5. pre_pause_rank stored ────────────────────────────────


@pytest.mark.asyncio
async def test_pre_pause_rank_stored():
    """Pausing stores original rank in pre_pause_rank."""
    user_id = uuid.uuid4()
    goal = make_goal(user_id=user_id, status="active", priority_rank=2)

    db = FakeDB(select_results=[
        goal,     # 1. _get_user_goal
        [],       # 2. _compact_ranks (no remaining active goals)
        None,     # 3. _mark_today_schedule_stale
        *_progress_results(),  # 4-5. _get_goal_progress
    ])

    await goal_mod.update_goal_status(user_id, goal.id, "paused", db)

    assert goal.pre_pause_rank == 2
    assert goal.priority_rank is None


# ── 6. Reorder rejects wrong IDs ────────────────────────────


@pytest.mark.asyncio
async def test_reorder_rejects_wrong_ids():
    """Reorder with an ID not in active goals returns 400."""
    user_id = uuid.uuid4()
    goal_a = make_goal(user_id=user_id, status="active", priority_rank=1)
    goal_b = make_goal(user_id=user_id, status="active", priority_rank=2)

    db = FakeDB(select_results=[
        [goal_a, goal_b],  # SELECT active goals FOR UPDATE
    ])

    wrong_id = uuid.uuid4()
    with pytest.raises(Exception) as exc_info:
        await goal_mod.reorder_goals(user_id, [goal_a.id, wrong_id], db)

    assert exc_info.value.status_code == 400


# ── 7. Reorder rejects partial list ─────────────────────────


@pytest.mark.asyncio
async def test_reorder_rejects_partial_list():
    """Reorder with only 2 of 3 active goal IDs returns 400."""
    user_id = uuid.uuid4()
    goal_a = make_goal(user_id=user_id, status="active", priority_rank=1)
    goal_b = make_goal(user_id=user_id, status="active", priority_rank=2)
    goal_c = make_goal(user_id=user_id, status="active", priority_rank=3)

    db = FakeDB(select_results=[
        [goal_a, goal_b, goal_c],  # SELECT active goals FOR UPDATE
    ])

    with pytest.raises(Exception) as exc_info:
        # Only 2 of 3 IDs provided
        await goal_mod.reorder_goals(user_id, [goal_a.id, goal_b.id], db)

    assert exc_info.value.status_code == 400


# ── 8. Double-pause rejected ────────────────────────────────


@pytest.mark.asyncio
async def test_double_pause_rejected():
    """Pausing an already-paused goal returns 400."""
    user_id = uuid.uuid4()
    goal = make_goal(user_id=user_id, status="paused")

    db = FakeDB(select_results=[goal])

    with pytest.raises(Exception) as exc_info:
        await goal_mod.update_goal_status(user_id, goal.id, "paused", db)

    assert exc_info.value.status_code == 400


# ── 9. Resume from achieved rejected ────────────────────────


@pytest.mark.asyncio
async def test_resume_from_achieved_rejected():
    """achieved → active is not a valid transition."""
    user_id = uuid.uuid4()
    goal = make_goal(user_id=user_id, status="achieved")

    db = FakeDB(select_results=[goal])

    with pytest.raises(Exception) as exc_info:
        await goal_mod.update_goal_status(user_id, goal.id, "active", db)

    assert exc_info.value.status_code == 400


# ── 10. Compact ranks idempotent ─────────────────────────────


@pytest.mark.asyncio
async def test_compact_ranks_idempotent():
    """Compacting already-contiguous ranks (1,2,3) is a no-op."""
    user_id = uuid.uuid4()
    goal_a = make_goal(user_id=user_id, status="active", priority_rank=1)
    goal_b = make_goal(user_id=user_id, status="active", priority_rank=2)
    goal_c = make_goal(user_id=user_id, status="active", priority_rank=3)

    db = FakeDB(select_results=[[goal_a, goal_b, goal_c]])

    await goal_mod._compact_ranks(user_id, db)

    assert goal_a.priority_rank == 1
    assert goal_b.priority_rank == 2
    assert goal_c.priority_rank == 3


# ── 11. Abandon nulls rank ──────────────────────────────────


@pytest.mark.asyncio
async def test_abandon_active_nulls_rank():
    """Abandoning an active goal NULLs rank, sets deleted_at, and compacts."""
    user_id = uuid.uuid4()
    goal = make_goal(user_id=user_id, status="active", priority_rank=2)
    other = make_goal(user_id=user_id, status="active", priority_rank=1)

    db = FakeDB(select_results=[
        goal,          # 1. _get_user_goal
        [other],       # 2. _compact_ranks (remaining active goals)
        None,          # 3. _mark_today_schedule_stale
        *_progress_results(),  # 4-5. _get_goal_progress
    ])

    await goal_mod.update_goal_status(user_id, goal.id, "abandoned", db)

    assert goal.status == "abandoned"
    assert goal.priority_rank is None
    assert goal.deleted_at is not None
    # Remaining goal compacted
    assert other.priority_rank == 1


# ── 12. Stale marking sets flag ──────────────────────────────


@pytest.mark.asyncio
async def test_stale_marking_sets_flag():
    """_mark_today_schedule_stale sets is_stale=True on today's schedule."""
    schedule = SimpleNamespace(is_stale=False)
    db = FakeDB(select_results=[schedule])

    await goal_mod._mark_today_schedule_stale(uuid.uuid4(), db)

    assert schedule.is_stale is True
