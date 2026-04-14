import uuid

from fastapi import APIRouter, Request
from app.config import settings
from app.core.rate_limit import limiter
from app.core.dependencies import CurrentUserComplete, DB
from app.schemas.goals import (
    GoalUpdateRequest,
    GoalDetailResponse,
    GoalStatusUpdateRequest,
    GoalListResponse,
)
from app.services import goal_service

router = APIRouter(prefix="/goals", tags=["Goals"])


@router.get(
    "",
    response_model=GoalListResponse,
    summary="List all goals",
    description=(
        "Returns all goals (active, paused, achieved) ordered by most recent. "
        "Includes progress percentage for each goal."
    ),
)
async def list_goals(
    current_user: CurrentUserComplete, db: DB
) -> GoalListResponse:
    return await goal_service.list_all_goals(current_user.id, db)


@router.get(
    "/active",
    response_model=GoalDetailResponse,
    summary="Get current active goal",
    description="Returns the user's currently active goal with progress info.",
)
async def get_active_goal(
    current_user: CurrentUserComplete, db: DB
) -> GoalDetailResponse:
    return await goal_service.get_active_goal(current_user.id, db)


@router.put(
    "/{goal_id}",
    response_model=GoalDetailResponse,
    summary="Update a goal",
    description=(
        "Update an existing goal's title, description, target date, "
        "motivation, or metadata. Only provided fields are updated."
    ),
)
@limiter.limit(settings.RATE_LIMIT_DEFAULT)
async def update_goal(
    request: Request,
    goal_id: uuid.UUID,
    data: GoalUpdateRequest,
    current_user: CurrentUserComplete,
    db: DB,
) -> GoalDetailResponse:
    return await goal_service.update_goal(current_user.id, goal_id, data, db)


@router.patch(
    "/{goal_id}/status",
    response_model=GoalDetailResponse,
    summary="Update goal status",
    description=(
        "Transition a goal's status. Valid transitions:\n"
        "- active → paused, achieved, abandoned\n"
        "- paused → active (enforces single-active-goal), abandoned\n"
        "Use this to celebrate achievements or pause during breaks."
    ),
)
async def update_goal_status(
    goal_id: uuid.UUID,
    data: GoalStatusUpdateRequest,
    current_user: CurrentUserComplete,
    db: DB,
) -> GoalDetailResponse:
    return await goal_service.update_goal_status(current_user.id, goal_id, data.status, db)


@router.post(
    "/{goal_id}/pause",
    response_model=GoalDetailResponse,
    summary="Pause an active goal",
    description="Pause the active goal. This allows creating or resuming another goal.",
)
async def pause_goal(
    goal_id: uuid.UUID,
    current_user: CurrentUserComplete,
    db: DB,
) -> GoalDetailResponse:
    return await goal_service.pause_goal(current_user.id, goal_id, db)


@router.post(
    "/{goal_id}/resume",
    response_model=GoalDetailResponse,
    summary="Resume a paused goal",
    description=(
        "Resume a previously paused goal. "
        "Fails if another active goal already exists."
    ),
)
async def resume_goal(
    goal_id: uuid.UUID,
    current_user: CurrentUserComplete,
    db: DB,
) -> GoalDetailResponse:
    return await goal_service.resume_goal(current_user.id, goal_id, db)


@router.delete(
    "/{goal_id}",
    response_model=GoalDetailResponse,
    summary="Delete a goal",
    description="Soft-deletes a goal and sets its status to 'abandoned'.",
)
async def delete_goal(
    goal_id: uuid.UUID,
    current_user: CurrentUserComplete,
    db: DB,
) -> GoalDetailResponse:
    return await goal_service.delete_goal(current_user.id, goal_id, db)
