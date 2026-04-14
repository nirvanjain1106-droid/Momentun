"""
Goal Service — CRUD operations for user goals.

Enforces the single-active-goal rule:
- Only one goal can be 'active' at a time per user
- Pausing an active goal allows creating/resuming another
"""

import uuid
import logging
from datetime import datetime, timezone, date

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from fastapi import HTTPException, status

from app.models.goal import Goal, Task
from app.schemas.goals import GoalUpdateRequest, GoalDetailResponse, GoalListResponse

logger = logging.getLogger(__name__)


async def get_active_goal(user_id: uuid.UUID, db: AsyncSession) -> GoalDetailResponse:
    """Get the current active goal for a user."""
    result = await db.execute(
        select(Goal).where(
            and_(
                Goal.user_id == user_id,
                Goal.status == "active",
                Goal.deleted_at.is_(None),
            )
        )
    )
    goal = result.scalar_one_or_none()

    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active goal found",
        )

    return await _build_goal_response(goal, db)


async def list_all_goals(user_id: uuid.UUID, db: AsyncSession) -> GoalListResponse:
    """List all goals (active + historical), ordered by created_at desc."""
    result = await db.execute(
        select(Goal)
        .where(
            and_(
                Goal.user_id == user_id,
                Goal.deleted_at.is_(None),
            )
        )
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
    logger.info("goal_updated", extra={"goal_id": str(goal_id), "user_id": str(user_id)})

    return await _build_goal_response(goal, db)


async def update_goal_status(
    user_id: uuid.UUID,
    goal_id: uuid.UUID,
    new_status: str,
    db: AsyncSession,
) -> GoalDetailResponse:
    """
    Handle all goal status transitions:
    - active → paused
    - active → achieved
    - active → abandoned
    - paused → active (enforce single-active-goal)
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

    # If resuming (paused → active), enforce single-active-goal
    if new_status == "active":
        result = await db.execute(
            select(Goal).where(
                and_(
                    Goal.user_id == user_id,
                    Goal.status == "active",
                    Goal.deleted_at.is_(None),
                )
            )
        )
        existing_active = result.scalar_one_or_none()
        if existing_active:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You already have an active goal. Pause or complete it first.",
            )

    # If abandoning, soft-delete
    if new_status == "abandoned":
        goal.deleted_at = datetime.now(timezone.utc)

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
    """Resume a paused goal. Enforces single-active-goal rule."""
    return await update_goal_status(user_id, goal_id, "active", db)


async def delete_goal(
    user_id: uuid.UUID, goal_id: uuid.UUID, db: AsyncSession
) -> GoalDetailResponse:
    """Soft-delete a goal."""
    return await update_goal_status(user_id, goal_id, "abandoned", db)


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
    )
