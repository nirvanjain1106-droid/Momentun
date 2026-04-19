"""
Checkin Service — Phase 2

Handles:
1. Morning check-in — logs energy/mood, determines day type, 
   regenerates today's schedule if needed
2. Evening review — logs task completions, calculates completion rate,
   generates motivational message
"""

import uuid
import logging
from datetime import date, datetime, timezone
from typing import Optional

from app.core.timezone import get_user_today

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.models.user import User
from app.models.goal import (
    Schedule, Task, DailyLog, TaskLog
)
from app.schemas.checkin import (
    MorningCheckinRequest, MorningCheckinResponse,
    EveningReviewRequest, EveningReviewResponse,
)
from app.services.schedule_service import (
    generate_schedule_orchestrator, GenerateScheduleRequest
)
from app.services import insights_service

logger = logging.getLogger(__name__)

async def morning_checkin(
    user: User,
    data: MorningCheckinRequest,
    db: AsyncSession,
) -> MorningCheckinResponse:
    """
    Process morning check-in.
    1. Create or update daily log for today
    2. Determine what day type today should be
    3. Regenerate today's schedule based on check-in data
    4. Return human-readable message
    """
    today = get_user_today(getattr(user, "timezone", "Asia/Kolkata"))

    # Check if already checked in today
    existing_log = await _get_daily_log(user.id, today, db)
    if existing_log and existing_log.morning_checkin_at:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You've already checked in this morning. See you tonight!",
        )

    # Get today's schedule (may already exist)
    today_schedule = await _get_todays_schedule(user.id, today, db)

    # Determine day type based on check-in
    day_type = _determine_day_type_from_checkin(
        data.morning_energy,
        data.yesterday_rating,
        data.surprise_event,
    )

    # If day type changed from what was planned, regenerate schedule
    if today_schedule and today_schedule.day_type != day_type:
        # Soft delete existing schedule
        today_schedule.deleted_at = datetime.now(timezone.utc)
        await db.flush()
        today_schedule = None

    # Generate schedule if needed
    if not today_schedule:
        try:
            await generate_schedule_orchestrator(
                user=user,
                data=GenerateScheduleRequest(
                    target_date=today.isoformat(),
                    day_type=day_type,
                    use_llm=False,  # fast for morning check-in
                ),
                db=db,
            )
            # Reload
            today_schedule = await _get_todays_schedule(user.id, today, db)
        except (HTTPException, Exception) as exc:
            # Log failure but don't block check-in — user can still log their mood
            logger.warning("morning_checkin_schedule_generation_failed", extra={"error": str(exc)})

    # Create or update daily log
    if existing_log:
        existing_log.morning_energy = data.morning_energy
        existing_log.yesterday_rating = data.yesterday_rating
        existing_log.surprise_event = data.surprise_event
        existing_log.surprise_note = data.surprise_note
        existing_log.schedule_id = today_schedule.id if today_schedule else None
        existing_log.morning_checkin_at = datetime.now(timezone.utc)
        log = existing_log
    else:
        log = DailyLog(
            user_id=user.id,
            schedule_id=today_schedule.id if today_schedule else None,
            log_date=today,
            morning_energy=data.morning_energy,
            yesterday_rating=data.yesterday_rating,
            surprise_event=data.surprise_event or "none",
            surprise_note=data.surprise_note,
            morning_checkin_at=datetime.now(timezone.utc),
        )
        db.add(log)

    await db.flush()

    pattern_focus = None
    trajectory_nudge = None
    try:
        patterns = await insights_service.get_patterns(user, db)
        pattern_focus = insights_service.build_pattern_focus_line(patterns.patterns)
        trajectory = await insights_service.get_trajectory(user, db)
        trajectory_nudge = trajectory.motivational_nudge
    except HTTPException:
        pass

    # Build human-readable message
    message = _build_morning_message(
        user.name.split()[0],  # first name only
        data.morning_energy,
        data.yesterday_rating,
        day_type,
        pattern_focus,
        trajectory_nudge,
    )

    return MorningCheckinResponse(
        log_id=log.id,
        log_date=log.log_date,
        morning_energy=data.morning_energy,
        yesterday_rating=data.yesterday_rating,
        surprise_event=data.surprise_event,
        day_type_assigned=day_type,
        message=message,
    )


async def evening_review(
    user: User,
    data: EveningReviewRequest,
    db: AsyncSession,
) -> EveningReviewResponse:
    """
    Process evening review.
    1. Log completion status for each task
    2. Calculate daily completion rate
    3. Update daily log
    4. Generate motivational message
    """
    today = get_user_today(getattr(user, "timezone", "Asia/Kolkata"))

    # Get or create daily log
    log = await _get_daily_log(user.id, today, db)
    if not log:
        # Create minimal log if morning check-in was skipped
        today_schedule = await _get_todays_schedule(user.id, today, db)
        log = DailyLog(
            user_id=user.id,
            schedule_id=today_schedule.id if today_schedule else None,
            log_date=today,
        )
        db.add(log)
        await db.flush()

    if log.evening_review_at:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You've already submitted your evening review for today.",
        )

    schedule = await _get_todays_schedule(user.id, today, db)
    scheduled_tasks = await _get_active_tasks_for_schedule(user.id, schedule.id if schedule else None, db)
    expected_ids = {task.id for task in scheduled_tasks}
    submitted_map = {entry.task_id: entry for entry in data.task_completions}
    submitted_ids = set(submitted_map.keys())

    if expected_ids != submitted_ids:
        missing_ids = expected_ids - submitted_ids
        unknown_ids = submitted_ids - expected_ids
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "message": "Task completion payload must match today's scheduled tasks exactly.",
                "missing_task_ids": [str(task_id) for task_id in sorted(missing_ids)],
                "unknown_task_ids": [str(task_id) for task_id in sorted(unknown_ids)],
            },
        )

    # Process each task completion against verified scheduled tasks
    tasks_completed = 0
    tasks_scheduled = len(scheduled_tasks)

    for task in scheduled_tasks:
        completion = submitted_map[task.id]
        # Create task log
        task_log = TaskLog(
            task_id=task.id,
            daily_log_id=log.id,
            user_id=user.id,
            status=completion.status,
            skip_reason=completion.skip_reason,
            actual_duration_mins=completion.actual_duration_mins,
            quality_rating=completion.quality_rating,
            completed_at=datetime.now(timezone.utc)
            if completion.status == "completed"
            else None,
        )
        db.add(task_log)

        if completion.status == "completed":
            tasks_completed += 1

    # Calculate completion rate
    completion_rate = (
        tasks_completed / tasks_scheduled
        if tasks_scheduled > 0
        else 0.0
    )

    # Update daily log
    log.tasks_scheduled = tasks_scheduled
    log.tasks_completed = tasks_completed
    log.completion_rate = completion_rate
    log.mood_score = data.mood_score
    log.evening_note = data.evening_note
    log.evening_review_at = datetime.now(timezone.utc)
    log.actual_day_type = (
        await _get_todays_day_type(user.id, today, db)
    )

    await db.flush()

    pattern_focus = None
    trajectory_nudge = None
    try:
        patterns = await insights_service.refresh_patterns_after_evening_review(
            user.id,
            db,
            today,
        )
        pattern_focus = insights_service.build_pattern_focus_line(patterns)
        trajectory = await insights_service.get_trajectory(user, db)
        trajectory_nudge = trajectory.motivational_nudge
    except HTTPException:
        pass

    # Build motivational message
    message = _build_evening_message(
        user.name.split()[0],
        tasks_completed,
        tasks_scheduled,
        completion_rate,
        data.mood_score,
        trajectory_nudge,
        pattern_focus,
    )

    return EveningReviewResponse(
        log_id=log.id,
        log_date=log.log_date,
        tasks_scheduled=tasks_scheduled,
        tasks_completed=tasks_completed,
        completion_rate=round(completion_rate, 3),
        mood_score=data.mood_score,
        message=message,
    )


# ── Private helpers ───────────────────────────────────────────

async def _get_daily_log(
    user_id: uuid.UUID, log_date: date, db: AsyncSession
) -> Optional[DailyLog]:
    result = await db.execute(
        select(DailyLog).where(
            and_(
                DailyLog.user_id == user_id,
                DailyLog.log_date == log_date,
            )
        )
    )
    return result.scalar_one_or_none()


async def _get_todays_schedule(
    user_id: uuid.UUID, target_date: date, db: AsyncSession
) -> Optional[Schedule]:
    result = await db.execute(
        select(Schedule).where(
            and_(
                Schedule.user_id == user_id,
                Schedule.schedule_date == target_date,
                Schedule.deleted_at.is_(None),
            )
        )
    )
    return result.scalar_one_or_none()


async def _get_todays_day_type(
    user_id: uuid.UUID, target_date: date, db: AsyncSession
) -> Optional[str]:
    schedule = await _get_todays_schedule(user_id, target_date, db)
    return schedule.day_type if schedule else None


async def _get_active_tasks_for_schedule(
    user_id: uuid.UUID, schedule_id: Optional[uuid.UUID], db: AsyncSession
) -> list[Task]:
    if schedule_id is None:
        return []
    result = await db.execute(
        select(Task).where(
            and_(
                Task.schedule_id == schedule_id,
                Task.user_id == user_id,
                Task.task_status.in_(["active", "completed"]),
                Task.deleted_at.is_(None),
            )
        )
    )
    return result.scalars().all()


def _determine_day_type_from_checkin(
    morning_energy: str,
    yesterday_rating: str,
    surprise_event: Optional[str],
) -> str:
    """
    Determine today's day type from check-in data.
    This mirrors the logic in the constraint solver.
    """
    # Surprise events that compress the day
    if surprise_event in ("family_event", "travel", "college_extra"):
        return "compressed"

    # Sick → minimum viable
    if surprise_event == "sick":
        return "minimum_viable"

    # Both exhausted AND yesterday was bad
    if (morning_energy == "exhausted"
            and yesterday_rating in ("rough", "barely_survived")):
        return "minimum_viable"

    # Exhausted alone
    if morning_energy == "exhausted":
        return "recovery"

    # Yesterday barely survived
    if yesterday_rating == "barely_survived":
        return "recovery"

    # High energy + great yesterday
    if morning_energy == "high" and yesterday_rating == "crushed_it":
        return "stretch"

    return "standard"


def _build_morning_message(
    first_name: str,
    energy: str,
    yesterday_rating: str,
    day_type: str,
    pattern_focus: Optional[str] = None,
    trajectory_nudge: Optional[str] = None,
) -> str:
    messages = {
        "minimum_viable": (
            f"Hey {first_name}, low energy days happen. "
            f"I've stripped today down to just the essentials. "
            f"Finish even one task and today is a win."
        ),
        "recovery": (
            f"Morning {first_name}. Lighter day today — "
            f"your body and mind need this. "
            f"Consistency is more important than intensity."
        ),
        "stretch": (
            f"Let's go {first_name}! High energy + great yesterday — "
            f"today is a stretch day. "
            f"Make the most of this momentum."
        ),
        "compressed": (
            f"Hey {first_name}, looks like today is a bit packed. "
            f"I've compressed your schedule to fit what's available. "
            f"Focus on what matters most."
        ),
        "standard": (
            f"Good morning {first_name}! "
            f"Steady day — your schedule is ready. "
            f"Start with your first task within 30 minutes of reading this."
        ),
    }
    message = messages.get(day_type, messages["standard"])

    if pattern_focus:
        return f"{message} {pattern_focus}"
    if trajectory_nudge:
        return f"{message} {trajectory_nudge}"
    return message


def _build_evening_message(
    first_name: str,
    completed: int,
    scheduled: int,
    rate: float,
    mood: int,
    trajectory_nudge: Optional[str] = None,
    pattern_focus: Optional[str] = None,
) -> str:
    base_message: str
    if rate >= 0.9:
        base_message = (
            f"Outstanding day {first_name}! "
            f"You completed {completed}/{scheduled} tasks. "
            f"That's the kind of consistency that wins."
        )
    elif rate >= 0.6:
        base_message = (
            f"Solid day {first_name}. "
            f"{completed}/{scheduled} tasks done. "
            f"Keep showing up like this and the results will follow."
        )
    elif rate >= 0.3:
        base_message = (
            f"{completed}/{scheduled} today {first_name}. "
            f"Not your best, but you logged it - that's what matters. "
            f"Tomorrow we adjust."
        )
    else:
        base_message = (
            f"Rough day {first_name}. "
            f"It happens. Tomorrow's schedule will be lighter. "
            f"The fact that you're logging this means you haven't given up."
        )

    if rate < 0.6 and pattern_focus:
        return f"{base_message} {pattern_focus}"
    if trajectory_nudge:
        return f"{base_message} {trajectory_nudge}"
    return base_message
