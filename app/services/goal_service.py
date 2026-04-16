"""
Goal Service — Commit 3 (Multi-Goal Portfolio)

Multi-goal architecture:
- Up to MAX_ACTIVE_GOALS concurrent active goals per user
- Service-side rank compaction with row-level locks (no DB trigger)
- Full-reorder approach: NULL all ranks → write new order (avoids unique index collision)
- Resume assigns bottom rank; pre_pause_rank stored for frontend option
- Schedule staleness marked on any rank/goal mutation
"""

import uuid
import logging
from datetime import datetime, timezone, date

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from fastapi import HTTPException, status

from app.models.goal import Goal, Task, Schedule
from app.schemas.goals import GoalUpdateRequest, GoalDetailResponse, GoalListResponse, GoalCreateRequest
from app.core.constants import MAX_ACTIVE_GOALS

logger = logging.getLogger(__name__)


# ── Read ──────────────────────────────────────────────────────


async def get_active_goal(user_id: uuid.UUID, db: AsyncSession) -> GoalDetailResponse:
    """Get the highest-ranked active goal (backward compat for single-goal clients)."""
    result = await db.execute(
        select(Goal).where(
            and_(
                Goal.user_id == user_id,
                Goal.status == "active",
                Goal.deleted_at.is_(None),
            )
        ).order_by(Goal.priority_rank.asc())
        .limit(1)
    )
    goal = result.scalar_one_or_none()

    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active goal found",
        )

    return await _build_goal_response(goal, db)


async def get_active_goals(user_id: uuid.UUID, db: AsyncSession) -> list[Goal]:
    """Get all active goals ordered by rank. Used internally by schedule_service."""
    result = await db.execute(
        select(Goal).where(
            and_(
                Goal.user_id == user_id,
                Goal.status == "active",
                Goal.deleted_at.is_(None),
            )
        ).order_by(Goal.priority_rank.asc())
    )
    return list(result.scalars().all())


async def get_goal(user_id: uuid.UUID, goal_id: uuid.UUID, db: AsyncSession) -> GoalDetailResponse:
    """Get a specific goal by ID."""
    goal = await _get_user_goal(user_id, goal_id, db)
    return await _build_goal_response(goal, db)


async def list_all_goals(
    user_id: uuid.UUID,
    db: AsyncSession,
    status_filter: str | None = None,
) -> GoalListResponse:
    """List all goals (active + historical), ordered by created_at desc."""
    conditions = [
        Goal.user_id == user_id,
        Goal.deleted_at.is_(None),
    ]
    if status_filter:
        conditions.append(Goal.status == status_filter)

    result = await db.execute(
        select(Goal)
        .where(and_(*conditions))
        .order_by(Goal.created_at.desc())
    )
    goals = result.scalars().all()

    goal_responses = []
    active_count = 0
    for g in goals:
        resp = await _build_goal_response(g, db)
        goal_responses.append(resp)
        if g.status == "active":
            active_count += 1

    return GoalListResponse(
        goals=goal_responses,
        total=len(goal_responses),
        active_count=active_count,
    )


# ── Create / Update ──────────────────────────────────────────

async def create_goal(
    user_id: uuid.UUID,
    data: GoalCreateRequest,
    db: AsyncSession,
) -> GoalDetailResponse:
    """Create a new active goal with the specified target date."""
    active_count = await _count_active_goals(user_id, db)
    if active_count >= MAX_ACTIVE_GOALS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot exceed maximum {MAX_ACTIVE_GOALS} active goals"
        )

    next_rank = await _next_rank(user_id, db)
    
    target_date_obj: date
    if isinstance(data.target_date, str):
        target_date_obj = date.fromisoformat(data.target_date)
    else:
        target_date_obj = data.target_date
    
    goal = Goal(
        user_id=user_id,
        title=data.title,
        goal_type=data.goal_type,
        description=data.description,
        target_date=target_date_obj,
        motivation=data.motivation,
        consequence=data.consequence,
        success_metric=data.success_metric,
        goal_metadata=data.metadata,
        status="active",
        priority_rank=next_rank
    )
    db.add(goal)
    await db.flush()
    await _mark_today_schedule_stale(user_id, db)
    
    logger.info("goal_created", extra={"goal_id": str(goal.id), "user_id": str(user_id)})
    return await _build_goal_response(goal, db)



async def update_goal(
    user_id: uuid.UUID,
    goal_id: uuid.UUID,
    data: GoalUpdateRequest,
    db: AsyncSession,
) -> GoalDetailResponse:
    """Update an existing goal. Only non-None fields are updated."""
    goal = await _get_user_goal(user_id, goal_id, db)

    update_data = data.model_dump(exclude_unset=True, exclude_none=True)

    # Handle metadata field name mapping
    if "metadata" in update_data:
        update_data["goal_metadata"] = update_data.pop("metadata")

    # Handle target_date conversion
    if "target_date" in update_data:
        update_data["target_date"] = date.fromisoformat(update_data["target_date"])

    for field, value in update_data.items():
        setattr(goal, field, value)

    await db.flush()

    # Mark today's schedule stale if the goal is active (title/metadata changed)
    if goal.status == "active":
        await _mark_today_schedule_stale(user_id, db)

    logger.info("goal_updated", extra={"goal_id": str(goal_id), "user_id": str(user_id)})

    return await _build_goal_response(goal, db)


# ── Status Transitions ────────────────────────────────────────


async def update_goal_status(
    user_id: uuid.UUID,
    goal_id: uuid.UUID,
    new_status: str,
    db: AsyncSession,
) -> GoalDetailResponse:
    """
    Handle all goal status transitions:
    - active → paused, achieved, abandoned
    - paused → active (multi-goal: assign bottom rank, enforce cap)
    """
    goal = await _get_user_goal(user_id, goal_id, db)

    current = goal.status
    valid_transitions = {
        "active": {"paused", "achieved", "abandoned"},
        "paused": {"active", "abandoned"},
    }

    allowed = valid_transitions.get(current, set())
    if new_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot transition from '{current}' to '{new_status}'. Allowed: {allowed or 'none'}",
        )

    # ── active → paused: snapshot rank, null it, compact ──
    if current == "active" and new_status == "paused":
        goal.pre_pause_rank = goal.priority_rank
        goal.priority_rank = None
        goal.status = "paused"
        await db.flush()
        await _compact_ranks(user_id, db)
        await _mark_today_schedule_stale(user_id, db)

    # ── active → achieved: null rank, compact ──
    elif current == "active" and new_status == "achieved":
        goal.priority_rank = None
        goal.status = "achieved"
        await db.flush()
        await _compact_ranks(user_id, db)
        await _mark_today_schedule_stale(user_id, db)

    # ── active → abandoned: null rank, soft-delete, compact ──
    elif current == "active" and new_status == "abandoned":
        goal.priority_rank = None
        goal.status = "abandoned"
        goal.deleted_at = datetime.now(timezone.utc)
        await db.flush()
        await _compact_ranks(user_id, db)
        await _mark_today_schedule_stale(user_id, db)

    # ── paused → active: assign bottom rank, enforce cap ──
    elif current == "paused" and new_status == "active":
        active_count = await _count_active_goals(user_id, db)
        if active_count >= MAX_ACTIVE_GOALS:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"You already have {MAX_ACTIVE_GOALS} active goals. "
                       f"Pause or complete one first.",
            )
        bottom_rank = await _next_rank(user_id, db)
        goal.priority_rank = bottom_rank
        goal.status = "active"
        await db.flush()
        await _mark_today_schedule_stale(user_id, db)

    # ── paused → abandoned ──
    elif current == "paused" and new_status == "abandoned":
        goal.status = "abandoned"
        goal.deleted_at = datetime.now(timezone.utc)
        await db.flush()

    else:
        goal.status = new_status
        await db.flush()

    action_log = {
        "achieved": "goal_achieved",
        "paused": "goal_paused",
        "abandoned": "goal_abandoned",
        "active": "goal_resumed",
    }
    logger.info(
        action_log.get(new_status, "goal_status_changed"),
        extra={"goal_id": str(goal_id), "user_id": str(user_id), "new_status": new_status},
    )

    return await _build_goal_response(goal, db)


async def pause_goal(
    user_id: uuid.UUID, goal_id: uuid.UUID, db: AsyncSession
) -> GoalDetailResponse:
    """Pause an active goal."""
    return await update_goal_status(user_id, goal_id, "paused", db)


async def resume_goal(
    user_id: uuid.UUID, goal_id: uuid.UUID, db: AsyncSession
) -> GoalDetailResponse:
    """Resume a paused goal. Assigns bottom rank, enforces cap."""
    return await update_goal_status(user_id, goal_id, "active", db)


async def delete_goal(
    user_id: uuid.UUID, goal_id: uuid.UUID, db: AsyncSession
) -> GoalDetailResponse:
    """Soft-delete a goal."""
    return await update_goal_status(user_id, goal_id, "abandoned", db)


# ── Reorder ───────────────────────────────────────────────────


async def reorder_goals(
    user_id: uuid.UUID,
    goal_ids: list[uuid.UUID],
    db: AsyncSession,
) -> GoalListResponse:
    """
    Full reorder of active goals.
    Strategy: lock all active goals → NULL all ranks → write new order.
    This avoids unique index collisions entirely.
    """
    # Lock all active goals with FOR UPDATE
    result = await db.execute(
        select(Goal).where(
            and_(
                Goal.user_id == user_id,
                Goal.status == "active",
                Goal.deleted_at.is_(None),
            )
        ).with_for_update()
    )
    active_goals = result.scalars().all()
    active_ids = {g.id for g in active_goals}

    # Validate: goal_ids must match exactly the active goal IDs
    requested_ids = set(goal_ids)
    if requested_ids != active_ids:
        missing = active_ids - requested_ids
        extra = requested_ids - active_ids
        detail_parts = []
        if missing:
            detail_parts.append(f"Missing active goals: {[str(m) for m in missing]}")
        if extra:
            detail_parts.append(f"Unknown/inactive goals: {[str(e) for e in extra]}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"goal_ids must contain exactly your active goals. {'. '.join(detail_parts)}",
        )

    # Step 1: Set temporary negative ranks (avoids both unique index collision
    # AND ck_active_goal_has_rank CHECK which requires active goals to have non-NULL rank).
    # Negative ranks are outside the valid 1..N range so they won't collide.
    goal_map = {g.id: g for g in active_goals}
    for i, goal in enumerate(active_goals):
        goal.priority_rank = -(i + 1)  # -1, -2, -3
    await db.flush()

    # Step 2: Write new order (1-indexed)
    for rank, gid in enumerate(goal_ids, start=1):
        goal_map[gid].priority_rank = rank
    await db.flush()

    # Mark schedule stale
    await _mark_today_schedule_stale(user_id, db)

    logger.info("goals_reordered", extra={
        "user_id": str(user_id),
        "new_order": [str(g) for g in goal_ids],
    })

    return await list_all_goals(user_id, db, status_filter="active")


# ── Private helpers ─────────────────────────────────────────────


async def _get_user_goal(
    user_id: uuid.UUID, goal_id: uuid.UUID, db: AsyncSession
) -> Goal:
    """Fetch a goal owned by the user or raise 404."""
    result = await db.execute(
        select(Goal).where(
            and_(
                Goal.id == goal_id,
                Goal.user_id == user_id,
                Goal.deleted_at.is_(None),
            )
        )
    )
    goal = result.scalar_one_or_none()

    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found",
        )

    return goal


async def _count_active_goals(user_id: uuid.UUID, db: AsyncSession) -> int:
    """Count currently active goals for a user."""
    result = await db.execute(
        select(func.count(Goal.id)).where(
            and_(
                Goal.user_id == user_id,
                Goal.status == "active",
                Goal.deleted_at.is_(None),
            )
        )
    )
    return result.scalar() or 0


async def _next_rank(user_id: uuid.UUID, db: AsyncSession) -> int:
    """Get the next available rank (max + 1) for a user's active goals."""
    result = await db.execute(
        select(func.max(Goal.priority_rank)).where(
            and_(
                Goal.user_id == user_id,
                Goal.status == "active",
                Goal.deleted_at.is_(None),
            )
        )
    )
    max_rank = result.scalar()
    return (max_rank or 0) + 1


async def _compact_ranks(user_id: uuid.UUID, db: AsyncSession) -> None:
    """
    Service-side rank compaction with row-level locks.
    Ensures active goals have contiguous ranks 1, 2, 3...
    Called after any goal leaves the active set (pause/achieve/abandon).
    """
    result = await db.execute(
        select(Goal)
        .where(
            and_(
                Goal.user_id == user_id,
                Goal.status == "active",
                Goal.deleted_at.is_(None),
            )
        )
        .with_for_update()
        .order_by(Goal.priority_rank.asc().nullslast())
    )
    goals = result.scalars().all()

    for i, goal in enumerate(goals, start=1):
        goal.priority_rank = i

    await db.flush()


async def _mark_today_schedule_stale(
    user_id: uuid.UUID, db: AsyncSession
) -> None:
    """Mark today's schedule as stale so it regenerates on next fetch."""
    try:
        # We don't have user timezone here easily, use UTC date as fallback
        # The schedule_service will handle timezone properly on fetch
        today = date.today()
        result = await db.execute(
            select(Schedule).where(
                and_(
                    Schedule.user_id == user_id,
                    Schedule.schedule_date == today,
                    Schedule.deleted_at.is_(None),
                )
            )
        )
        schedule = result.scalar_one_or_none()
        if schedule:
            schedule.is_stale = True
            await db.flush()
    except Exception:
        # Never fail the main operation for stale marking
        logger.exception("stale_marking_failed", extra={"user_id": str(user_id)})


async def _get_goal_progress(goal_id: uuid.UUID, db: AsyncSession) -> dict:
    """Calculate goal progress from TaskLog data."""
    # Total tasks ever created for this goal
    total_result = await db.execute(
        select(func.count(Task.id)).where(
            and_(Task.goal_id == goal_id, Task.deleted_at.is_(None))
        )
    )
    total = total_result.scalar() or 0

    # Completed tasks
    completed_result = await db.execute(
        select(func.count(Task.id)).where(
            and_(
                Task.goal_id == goal_id,
                Task.task_status == "completed",
                Task.deleted_at.is_(None),
            )
        )
    )
    completed = completed_result.scalar() or 0

    progress_pct = round((completed / total * 100), 1) if total > 0 else 0.0

    return {
        "progress_pct": progress_pct,
        "tasks_completed": completed,
        "tasks_total": total,
    }


async def _build_goal_response(goal: Goal, db: AsyncSession) -> GoalDetailResponse:
    """Build GoalDetailResponse with progress data."""
    progress = await _get_goal_progress(goal.id, db)

    days_remaining = (goal.target_date - date.today()).days
    if days_remaining < 0:
        days_remaining = 0

    return GoalDetailResponse(
        id=goal.id,
        user_id=goal.user_id,
        title=goal.title,
        goal_type=goal.goal_type,
        description=goal.description,
        target_date=goal.target_date,
        motivation=goal.motivation,
        consequence=goal.consequence,
        success_metric=goal.success_metric,
        status=goal.status,
        metadata=goal.goal_metadata,
        progress_pct=progress["progress_pct"],
        tasks_completed=progress["tasks_completed"],
        tasks_total=progress["tasks_total"],
        days_remaining=days_remaining,
        priority_rank=goal.priority_rank,
        pre_pause_rank=goal.pre_pause_rank,
    )
