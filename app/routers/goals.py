import uuid
from typing import Optional

from fastapi import APIRouter, Request, Query
from app.config import settings
from app.core.rate_limit import limiter
from app.core.dependencies import CurrentUserComplete, DB
from app.schemas.goals import (
    GoalUpdateRequest,
    GoalDetailResponse,
    GoalStatusUpdateRequest,
    GoalReorderRequest,
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
        "Includes progress percentage for each goal. "
        "Use ?status=active to filter by status."
    ),
)
async def list_goals(
    current_user: CurrentUserComplete,
    db: DB,
    status: Optional[str] = Query(None, description="Filter by status: active, paused, achieved, abandoned"),
) -> GoalListResponse:
    return await goal_service.list_all_goals(current_user.id, db, status_filter=status)


@router.get(
    "/active",
    response_model=GoalDetailResponse,
    summary="Get highest-ranked active goal",
    description=(
        "Returns the user's highest-ranked active goal with progress info. "
        "For all active goals, use GET /goals?status=active."
    ),
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
        "- paused → active (assigns bottom rank, enforces 3-goal cap), abandoned\n"
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
    description="Pause the active goal. Snapshots rank to pre_pause_rank.",
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
        "Assigns bottom rank. Fails if 3 active goals already exist."
    ),
)
async def resume_goal(
    goal_id: uuid.UUID,
    current_user: CurrentUserComplete,
    db: DB,
) -> GoalDetailResponse:
    return await goal_service.resume_goal(current_user.id, goal_id, db)


@router.put(
    "/reorder",
    response_model=GoalListResponse,
    summary="Reorder active goals",
    description=(
        "Reorder active goals by providing the desired order of goal IDs. "
        "Must include exactly all active goal IDs. "
        "Marks today's schedule as stale for regeneration."
    ),
)
@limiter.limit(settings.RATE_LIMIT_DEFAULT)
async def reorder_goals(
    request: Request,
    data: GoalReorderRequest,
    current_user: CurrentUserComplete,
    db: DB,
) -> GoalListResponse:
    return await goal_service.reorder_goals(current_user.id, data.goal_ids, db)


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
