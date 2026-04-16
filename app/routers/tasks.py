"""Task management router — real-time task lifecycle operations."""

import uuid
from typing import Optional

from fastapi import APIRouter, Query, Request, Header
from app.config import settings
from app.core.rate_limit import limiter
from app.core.dependencies import CurrentUserComplete, DB
from app.schemas.tasks import (
    TaskCompleteRequest,
    TaskParkRequest,
    TaskRescheduleRequest,
    BulkDeleteRequest,
    TaskDetailResponse,
    ParkedTasksListResponse,
    BulkDeleteResponse,
    QuickAddRequest,
    TaskMutationResponse,
)
from app.services import task_service, user_service, insights_service
from app.services.idempotency_service import IdempotencyService
from app.core.timezone import get_user_today

router = APIRouter(prefix="/tasks", tags=["Tasks"])


@router.post(
    "/{task_id}/complete",
    response_model=TaskMutationResponse,
    summary="Mark a task as completed",
    description=(
        "Mark a task as done in real time during the day. "
        "Creates a task log entry immediately. "
        "Does not conflict with evening review."
    ),
)
@limiter.limit(settings.RATE_LIMIT_DEFAULT)
async def complete_task(
    request: Request,
    task_id: uuid.UUID,
    data: TaskCompleteRequest,
    current_user: CurrentUserComplete,
    db: DB,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
) -> TaskMutationResponse:
    if idempotency_key:
        cached = await IdempotencyService.get_cached_response(db, idempotency_key)
        if cached:
            return TaskMutationResponse(**cached.response_body)

    task_res = await task_service.complete_task(current_user.id, task_id, data, db)
    
    today = get_user_today(current_user.timezone)
    day_score = await user_service.calculate_day_score(current_user.id, today, db)
    streak = await insights_service.get_streak(current_user, db)
    
    response_data = TaskMutationResponse(task=task_res, day_score=day_score, streak=streak)
    
    if idempotency_key:
        await IdempotencyService.save_response(
            db, idempotency_key, f"/tasks/{task_id}/complete", response_data.model_dump(mode="json")
        )

    return response_data


@router.post(
    "/{task_id}/park",
    response_model=TaskMutationResponse,
    summary="Park a task (move to parking lot)",
    description=(
        "Manually move a task to the parking lot. "
        "Removes it from today's schedule. "
        "Can be rescheduled to a future date later."
    ),
)
@limiter.limit(settings.RATE_LIMIT_DEFAULT)
async def park_task(
    request: Request,
    task_id: uuid.UUID,
    data: TaskParkRequest,
    current_user: CurrentUserComplete,
    db: DB,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
) -> TaskMutationResponse:
    if idempotency_key:
        cached = await IdempotencyService.get_cached_response(db, idempotency_key)
        if cached:
            return TaskMutationResponse(**cached.response_body)

    task_res = await task_service.park_task(current_user.id, task_id, data.reason, db)
    
    today = get_user_today(current_user.timezone)
    day_score = await user_service.calculate_day_score(current_user.id, today, db)
    streak = await insights_service.get_streak(current_user, db)
    
    response_data = TaskMutationResponse(task=task_res, day_score=day_score, streak=streak)
    
    if idempotency_key:
        await IdempotencyService.save_response(
            db, idempotency_key, f"/tasks/{task_id}/park", response_data.model_dump(mode="json")
        )

    return response_data


@router.post(
    "/reschedule",
    response_model=TaskDetailResponse,
    summary="Reschedule a parked task",
    description=(
        "Move a parked or deferred task to a specific date. "
        "If the target date already has a schedule, the task is attached to it. "
        "If not, the task waits until that day's schedule is generated."
    ),
)
@limiter.limit(settings.RATE_LIMIT_DEFAULT)
async def reschedule_task(
    request: Request,
    data: TaskRescheduleRequest,
    current_user: CurrentUserComplete,
    db: DB,
) -> TaskDetailResponse:
    return await task_service.reschedule_task(
        current_user.id, data.task_id, data.target_date, db
    )


@router.post(
    "/{task_id}/undo",
    response_model=TaskMutationResponse,
    summary="Undo last task action",
    description=(
        "Revert the last status change on a task. "
        "Supports one level of undo. "
        "If undoing a completion, the task log is also removed."
    ),
)
async def undo_task(
    request: Request,
    task_id: uuid.UUID,
    current_user: CurrentUserComplete,
    db: DB,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
) -> TaskMutationResponse:
    if idempotency_key:
        cached = await IdempotencyService.get_cached_response(db, idempotency_key)
        if cached:
            return TaskMutationResponse(**cached.response_body)

    task_res = await task_service.undo_task(current_user.id, task_id, db)
    
    today = get_user_today(current_user.timezone)
    day_score = await user_service.calculate_day_score(current_user.id, today, db)
    streak = await insights_service.get_streak(current_user, db)
    
    response_data = TaskMutationResponse(task=task_res, day_score=day_score, streak=streak)
    
    if idempotency_key:
        await IdempotencyService.save_response(
            db, idempotency_key, f"/tasks/{task_id}/undo", response_data.model_dump(mode="json")
        )

    return response_data


@router.get(
    "/parked",
    response_model=ParkedTasksListResponse,
    summary="View parking lot",
    description=(
        "Get all parked and deferred tasks. "
        "Use ?stale=true to filter tasks parked for more than 14 days."
    ),
)
async def get_parked_tasks(
    current_user: CurrentUserComplete,
    db: DB,
    stale: Optional[bool] = Query(
        default=False,
        description="If true, only return tasks parked >14 days",
    ),
) -> ParkedTasksListResponse:
    return await task_service.get_parked_tasks(current_user.id, db, stale_only=stale)


@router.delete(
    "/{task_id}",
    response_model=TaskDetailResponse,
    summary="Soft-delete a task",
    description="Soft-delete a task permanently. Data is kept for history.",
)
async def delete_task(
    task_id: uuid.UUID,
    current_user: CurrentUserComplete,
    db: DB,
) -> TaskDetailResponse:
    return await task_service.soft_delete_task(current_user.id, task_id, db)


@router.post(
    "/bulk-delete",
    response_model=BulkDeleteResponse,
    summary="Bulk delete stale tasks",
    description=(
        "Soft-delete multiple tasks at once. "
        "Useful for clearing stale parking lot items."
    ),
)
@limiter.limit(settings.RATE_LIMIT_DEFAULT)
async def bulk_delete_tasks(
    request: Request,
    data: BulkDeleteRequest,
    current_user: CurrentUserComplete,
    db: DB,
) -> BulkDeleteResponse:
    return await task_service.bulk_delete_tasks(current_user.id, data.task_ids, db)


@router.post(
    "/quick-add",
    response_model=TaskDetailResponse,
    status_code=201,
    summary="Quick-add a task",
    description=(
        "Zero-friction task capture. Just provide title + duration. "
        "Task goes straight to parking lot. "
        "Can be scheduled later via reschedule or by the solver."
    ),
)
async def quick_add_task(
    data: QuickAddRequest,
    current_user: CurrentUserComplete,
    db: DB,
) -> TaskDetailResponse:
    return await task_service.quick_add_task(
        current_user.id, data.title, data.duration_mins, data.goal_id, db
    )
