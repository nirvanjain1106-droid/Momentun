"""
Task Service — real-time task lifecycle operations.
Complete, park, reschedule, undo, delete, bulk-delete.
"""

import uuid
import logging
from datetime import datetime, timezone, date, timedelta
from typing import Optional, List
import hmac
import hashlib

from app.config import settings

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select, and_, update
from fastapi import HTTPException, status

from app.models.goal import Task, TaskLog, DailyLog, Schedule
from app.schemas.tasks import (
    TaskCompleteRequest,
    TaskDetailResponse,
    ParkedTaskDetailResponse,
    ParkedTasksListResponse,
    BulkDeleteResponse,
)

from app.core.constants import PRIORITY_LABELS

logger = logging.getLogger(__name__)

def _pii_hash(value: str) -> str:
    return hmac.new(
        settings.SECRET_KEY.encode(), value.encode(), hashlib.sha256,
    ).hexdigest()[:12]


# ── Complete ──────────────────────────────────────────────────


async def complete_task(
    user_id: uuid.UUID,
    task_id: uuid.UUID,
    data: TaskCompleteRequest,
    db: AsyncSession,
) -> TaskDetailResponse:
    """
    Mark a task as completed in real time.
    Creates a DailyLog (if needed) and a TaskLog entry.
    """
    task = await _get_user_task(user_id, task_id, db)

    if task.task_status == "completed":
        task_response = _build_task_response(task)
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Conflict detected",
                "server_state": task_response.model_dump(mode="json"),
                "merge_rules": ["completed_wins", "deleted_wins"],
            }
        )

    # Get or create today's DailyLog
    today = date.today()
    daily_log = await _get_or_create_daily_log(user_id, today, task.schedule_id, db)

    # Check if a TaskLog already exists (from evening review)
    existing_log = await db.execute(
        select(TaskLog).where(
            and_(TaskLog.task_id == task_id, TaskLog.daily_log_id == daily_log.id)
        )
    )
    if existing_log.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Task completion already logged for today",
        )

    # Update task status
    task.previous_status = task.task_status
    task.task_status = "completed"

    # Create TaskLog
    task_log = TaskLog(
        task_id=task.id,
        daily_log_id=daily_log.id,
        user_id=user_id,
        status="completed",
        actual_duration_mins=data.actual_duration_mins,
        quality_rating=data.quality_rating,
        completed_at=datetime.now(timezone.utc),
    )
    db.add(task_log)
    await db.flush()

    logger.info("task_completed", extra={"task_id": str(task_id), "user_id": str(user_id)})
    return _build_task_response(task)


# ── Park ──────────────────────────────────────────────────────


async def park_task(
    user_id: uuid.UUID,
    task_id: uuid.UUID,
    reason: Optional[str],
    db: AsyncSession,
) -> TaskDetailResponse:
    """Move a task to the parking lot."""
    task = await _get_user_task(user_id, task_id, db)

    if task.task_status == "completed":
        task_response = _build_task_response(task)
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Conflict detected",
                "server_state": task_response.model_dump(mode="json"),
                "merge_rules": ["completed_wins", "deleted_wins"],
            }
        )
    if task.task_status == "parked":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Task is already moved to later",
        )

    task.previous_status = task.task_status
    task.task_status = "parked"
    task.scheduled_start = None
    task.scheduled_end = None
    task.schedule_id = None

    await db.flush()
    logger.info("task_parked", extra={
        "task_id": str(task_id), "user_id": str(user_id),
    })
    return _build_task_response(task)


# ── Reschedule ────────────────────────────────────────────────


async def _find_next_available_date(
    user_id: uuid.UUID,
    new_task: "TaskRequirement",
    start_date: date,
    db: AsyncSession,
    max_lookahead_days: int = 3,
) -> Optional[date]:
    from app.services.schedule_service import build_solver_for_user
    from app.services.constraint_solver import ScheduledTask
    
    for delta in range(1, max_lookahead_days + 1):
        candidate = start_date + timedelta(days=delta)
        result = await db.execute(
            select(Schedule).options(selectinload(Schedule.tasks)).where(
                and_(
                    Schedule.user_id == user_id,
                    Schedule.schedule_date == candidate,
                )
            )
        )
        existing = result.scalar_one_or_none()
        existing_scheduled = []
        if existing:
            for t in existing.tasks:
                if t.task_status not in ("active", "completed", "expired"): continue
                if not t.scheduled_start or not t.scheduled_end: continue
                existing_scheduled.append(ScheduledTask(
                    task_id=str(t.id),
                    title=t.title,
                    task_type=t.task_type,
                    duration_mins=t.duration_mins,
                    energy_required=t.energy_required,
                    scheduled_start=t.scheduled_start,
                    scheduled_end=t.scheduled_end,
                ))
                
        solver = await build_solver_for_user(user_id, candidate, db)
        if solver.fit_single_task(new_task, existing_scheduled, candidate):
            return candidate
    return None

async def reschedule_task(
    user_id: uuid.UUID,
    task_id: uuid.UUID,
    target_date_str: str,
    db: AsyncSession,
) -> TaskDetailResponse:
    """Move a parked/deferred task to a specific date."""
    task = await _get_user_task(user_id, task_id, db)

    if task.task_status == "completed":
        task_response = _build_task_response(task)
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Conflict detected",
                "server_state": task_response.model_dump(mode="json"),
                "merge_rules": ["completed_wins", "deleted_wins"],
            }
        )

    if task.task_status not in ("parked", "deferred"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Can only reschedule tasks saved for later. Current status: {task.task_status}",
        )

    target_date = date.fromisoformat(target_date_str)

    # Check if target date has a schedule
    result = await db.execute(
        select(Schedule).options(selectinload(Schedule.tasks)).where(
            and_(
                Schedule.user_id == user_id,
                Schedule.schedule_date == target_date,
            )
        )
    )
    existing_schedule = result.scalar_one_or_none()

    if existing_schedule:
        from app.services.schedule_service import build_solver_for_user
        from app.services.constraint_solver import TaskRequirement, ScheduledTask
        
        req = TaskRequirement(
            id=str(task.id),
            title=task.title,
            task_type=task.task_type,
            duration_mins=task.duration_mins,
            energy_required=task.energy_required,
            priority=task.priority,
        )
        existing_scheduled = []
        completed_task_ids = set()
        
        for t in existing_schedule.tasks:
            if t.task_status == "completed":
                completed_task_ids.add(str(t.id))
            if t.task_status not in ("active", "completed", "expired"): continue
            if not t.scheduled_start or not t.scheduled_end: continue
            existing_scheduled.append(ScheduledTask(
                task_id=str(t.id),
                title=t.title,
                task_type=t.task_type,
                duration_mins=t.duration_mins,
                energy_required=t.energy_required,
                scheduled_start=t.scheduled_start,
                scheduled_end=t.scheduled_end,
            ))
            
        solver = await build_solver_for_user(user_id, target_date, db)
        placement = solver.fit_single_task(req, existing_scheduled, target_date, completed_task_ids=completed_task_ids)
        
        if not placement:
            suggested_date = await _find_next_available_date(user_id, req, target_date, db)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "reason": "no_suitable_gap",
                    "message": "No available time slot fits this task today.",
                    "suggested_date": suggested_date.isoformat() if suggested_date else None,
                }
            )
        
        # Attach to existing schedule
        task.schedule_id = existing_schedule.id
        task.previous_status = task.task_status
        task.task_status = "active"
        task.scheduled_start = placement.scheduled_start
        task.scheduled_end = placement.scheduled_end
        logger.info("task_rescheduled_to_existing", extra={
            "task_id": str(task_id), "target_date": target_date_str,
        })
    else:
        # Keep in parking lot but mark for future scheduling
        task.previous_status = task.task_status
        task.task_status = "deferred"
        logger.info("task_rescheduled_pending", extra={
            "task_id": str(task_id), "target_date": target_date_str,
        })

    await db.flush()
    return _build_task_response(task)


# ── Undo ──────────────────────────────────────────────────────


async def undo_task(
    user_id: uuid.UUID,
    task_id: uuid.UUID,
    db: AsyncSession,
) -> TaskDetailResponse:
    """Revert the last status change on a task (one-level undo)."""
    task = await _get_user_task(user_id, task_id, db)

    if not task.previous_status:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No previous status to undo to",
        )

    # If undoing a completion, remove the TaskLog
    if task.task_status == "completed" and task.previous_status != "completed":
        today = date.today()
        daily_log_result = await db.execute(
            select(DailyLog).where(
                and_(
                    DailyLog.user_id == user_id,
                    DailyLog.log_date == today,
                )
            )
        )
        daily_log = daily_log_result.scalar_one_or_none()
        if daily_log:
            log_result = await db.execute(
                select(TaskLog).where(
                    and_(
                        TaskLog.task_id == task_id,
                        TaskLog.daily_log_id == daily_log.id,
                    )
                )
            )
            task_log = log_result.scalar_one_or_none()
            if task_log:
                await db.delete(task_log)

    old_status = task.task_status
    task.task_status = task.previous_status
    task.previous_status = old_status  # allow reverse undo

    await db.flush()
    logger.info("task_undone", extra={
        "task_id": str(task_id), "user_id": str(user_id),
        "from": old_status, "to": task.task_status,
    })
    return _build_task_response(task)


# ── Parked Tasks ──────────────────────────────────────────────


async def get_parked_tasks(
    user_id: uuid.UUID,
    db: AsyncSession,
    stale_only: bool = False,
) -> ParkedTasksListResponse:
    """Get all parked/deferred tasks, with staleness info."""
    conditions = [
        Task.user_id == user_id,
        Task.task_status.in_(["parked", "deferred"]),
        Task.deleted_at.is_(None),
    ]

    if stale_only:
        stale_cutoff = datetime.now(timezone.utc) - timedelta(days=14)
        conditions.append(Task.created_at < stale_cutoff)

    result = await db.execute(
        select(Task).where(and_(*conditions)).order_by(Task.created_at.desc())
    )
    tasks = result.scalars().all()

    now = datetime.now(timezone.utc)
    parked_items = []
    stale_count = 0

    for t in tasks:
        days_parked = (now - t.created_at.replace(tzinfo=timezone.utc if t.created_at.tzinfo is None else t.created_at.tzinfo)).days
        is_stale = days_parked >= 14
        if is_stale:
            stale_count += 1

        parked_items.append(ParkedTaskDetailResponse(
            id=t.id,
            title=t.title,
            description=t.description,
            task_type=t.task_type,
            duration_mins=t.duration_mins,
            energy_required=t.energy_required,
            priority=t.priority,
            priority_label=PRIORITY_LABELS.get(t.priority, "Normal"),
            task_status=t.task_status,
            days_parked=days_parked,
            is_stale=is_stale,
            created_at=t.created_at,
        ))

    return ParkedTasksListResponse(
        tasks=parked_items,
        total=len(parked_items),
        stale_count=stale_count,
    )


# ── Delete ────────────────────────────────────────────────────


async def soft_delete_task(
    user_id: uuid.UUID,
    task_id: uuid.UUID,
    db: AsyncSession,
) -> TaskDetailResponse:
    """Soft-delete a single task."""
    task = await _get_user_task(user_id, task_id, db)

    if task.task_status == "completed":
        task_response = _build_task_response(task)
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Conflict detected",
                "server_state": task_response.model_dump(mode="json"),
                "merge_rules": ["completed_wins", "deleted_wins"],
            }
        )

    task.previous_status = task.task_status
    task.deleted_at = datetime.now(timezone.utc)

    await db.flush()
    logger.info("task_deleted", extra={"task_id": str(task_id), "user_id": str(user_id)})
    return _build_task_response(task)


async def bulk_delete_tasks(
    user_id: uuid.UUID,
    task_ids: List[uuid.UUID],
    db: AsyncSession,
) -> BulkDeleteResponse:
    """Soft-delete multiple tasks at once."""
    now = datetime.now(timezone.utc)

    result = await db.execute(
        update(Task)
        .where(
            and_(
                Task.id.in_(task_ids),
                Task.user_id == user_id,
                Task.deleted_at.is_(None),
            )
        )
        .values(deleted_at=now)
        .execution_options(synchronize_session="fetch")
    )

    deleted_count = result.rowcount
    logger.info("tasks_bulk_deleted", extra={
        "user_id": str(user_id), "deleted_count": deleted_count,
    })

    return BulkDeleteResponse(
        deleted_count=deleted_count,
        message=f"Successfully deleted {deleted_count} task(s)",
    )


# ── Private helpers ───────────────────────────────────────────


async def _get_user_task(
    user_id: uuid.UUID, task_id: uuid.UUID, db: AsyncSession,
    for_update: bool = True,
) -> Task:
    """
    Fetch a task owned by the user or raise 404.
    Uses SELECT FOR UPDATE by default to prevent race conditions (#7).
    """
    stmt = select(Task).where(
        and_(
            Task.id == task_id,
            Task.user_id == user_id,
            Task.deleted_at.is_(None),
        )
    )
    if for_update:
        stmt = stmt.with_for_update()

    result = await db.execute(stmt)
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )
    return task


async def _get_or_create_daily_log(
    user_id: uuid.UUID,
    log_date: date,
    schedule_id: Optional[uuid.UUID],
    db: AsyncSession,
) -> DailyLog:
    """Get today's DailyLog or create a minimal one."""
    result = await db.execute(
        select(DailyLog).where(
            and_(
                DailyLog.user_id == user_id,
                DailyLog.log_date == log_date,
            )
        )
    )
    daily_log = result.scalar_one_or_none()

    if daily_log:
        return daily_log

    # Auto-create minimal DailyLog
    daily_log = DailyLog(
        user_id=user_id,
        log_date=log_date,
        schedule_id=schedule_id,
    )
    db.add(daily_log)
    await db.flush()
    logger.info("daily_log_auto_created", extra={
        "user_id": str(user_id), "log_date": log_date.isoformat(),
    })
    return daily_log


def _build_task_response(task: Task) -> TaskDetailResponse:
    """Build a TaskDetailResponse from a Task model instance."""
    return TaskDetailResponse(
        id=task.id,
        title=task.title,
        description=task.description,
        task_type=task.task_type,
        scheduled_start=task.scheduled_start,
        scheduled_end=task.scheduled_end,
        duration_mins=task.duration_mins,
        energy_required=task.energy_required,
        priority=task.priority,
        priority_label=PRIORITY_LABELS.get(task.priority, "Normal"),
        is_mvp_task=task.is_mvp_task,
        sequence_order=task.sequence_order,
        task_status=task.task_status,
        previous_status=task.previous_status,
        goal_id=task.goal_id,
        goal_rank_snapshot=task.goal_rank_snapshot,
    )


# ── Quick Add ─────────────────────────────────────────────────


async def quick_add_task(
    user_id: uuid.UUID,
    title: str,
    duration_mins: int,
    goal_id: Optional[uuid.UUID],
    db: AsyncSession,
) -> TaskDetailResponse:
    """
    Quick-capture: create a task with minimal info, straight to 'later'.
    Zero friction — just title + duration. goal_id optional.
    """
    if not title or not title.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Title is required",
        )

    if duration_mins < 5 or duration_mins > 480:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Duration must be between 5 and 480 minutes",
        )

    task = Task(
        user_id=user_id,
        goal_id=goal_id,
        schedule_id=None,
        title=title.strip(),
        description=None,
        task_type="general",
        scheduled_start=None,
        scheduled_end=None,
        duration_mins=duration_mins,
        energy_required="medium",
        priority=2,  # PRIORITY_NORMAL
        is_mvp_task=False,
        sequence_order=999,
        task_status="parked",
    )
    db.add(task)
    await db.flush()

    logger.info("task_quick_added", extra={
        "task_id": str(task.id), "user_id": str(user_id), "title_hash": _pii_hash(title),
    })
    return _build_task_response(task)
