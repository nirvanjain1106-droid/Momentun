"""
Goal Service — CRUD operations for user goals.

Enforces the single-active-goal rule:
- Only one goal can be 'active' at a time per user
- Pausing an active goal allows creating/resuming another
"""

import uuid
import logging
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from fastapi import HTTPException, status

from app.models.goal import Goal
from app.schemas.goals import GoalUpdateRequest, GoalDetailResponse

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

    return GoalDetailResponse.model_validate(goal, from_attributes=True)


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
        from datetime import date
        update_data["target_date"] = date.fromisoformat(update_data["target_date"])

    for field, value in update_data.items():
        setattr(goal, field, value)

    await db.flush()
    logger.info("goal_updated", extra={"goal_id": str(goal_id), "user_id": str(user_id)})

    return GoalDetailResponse.model_validate(goal, from_attributes=True)


async def pause_goal(
    user_id: uuid.UUID, goal_id: uuid.UUID, db: AsyncSession
) -> GoalDetailResponse:
    """Pause an active goal."""
    goal = await _get_user_goal(user_id, goal_id, db)

    if goal.status != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Can only pause active goals. Current status: {goal.status}",
        )

    goal.status = "paused"
    await db.flush()
    logger.info("goal_paused", extra={"goal_id": str(goal_id), "user_id": str(user_id)})

    return GoalDetailResponse.model_validate(goal, from_attributes=True)


async def resume_goal(
    user_id: uuid.UUID, goal_id: uuid.UUID, db: AsyncSession
) -> GoalDetailResponse:
    """Resume a paused goal. Enforces single-active-goal rule."""
    goal = await _get_user_goal(user_id, goal_id, db)

    if goal.status != "paused":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Can only resume paused goals. Current status: {goal.status}",
        )

    # Check for existing active goal
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

    goal.status = "active"
    await db.flush()
    logger.info("goal_resumed", extra={"goal_id": str(goal_id), "user_id": str(user_id)})

    return GoalDetailResponse.model_validate(goal, from_attributes=True)


async def delete_goal(
    user_id: uuid.UUID, goal_id: uuid.UUID, db: AsyncSession
) -> GoalDetailResponse:
    """Soft-delete a goal."""
    goal = await _get_user_goal(user_id, goal_id, db)

    goal.deleted_at = datetime.now(timezone.utc)
    goal.status = "abandoned"
    await db.flush()
    logger.info("goal_deleted", extra={"goal_id": str(goal_id), "user_id": str(user_id)})

    return GoalDetailResponse.model_validate(goal, from_attributes=True)


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
