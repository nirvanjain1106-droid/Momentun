"""
User Service — profile management, settings, pause/resume, feedback, deletion.
"""

import uuid
import logging
from datetime import datetime, timezone, timedelta, date


from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from fastapi import HTTPException, status

from app.models.user import User
from app.models.goal import (
    Goal, Task, DailyLog, Feedback,
)
from app.core.security import verify_password, hash_password
from app.schemas.users import (
    UserProfileResponse,
    UserProfileUpdateRequest,
    ChangePasswordRequest,
    PauseRequest,
    FeedbackRequest,
    FeedbackResponse,
    MessageResponse,
    DayScoreResponse,
)

logger = logging.getLogger(__name__)


# ── Profile ──────────────────────────────────────────────────


async def get_profile(user: User) -> UserProfileResponse:
    """Get current user profile."""
    return UserProfileResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        user_type=user.user_type,
        timezone=user.timezone,
        onboarding_complete=user.onboarding_complete,
        onboarding_step=user.onboarding_step,
        email_verified=user.email_verified,
        is_paused=user.paused_at is not None,
        paused_reason=user.paused_reason,
        created_at=user.created_at.isoformat(),
    )


async def update_profile(
    user: User,
    data: UserProfileUpdateRequest,
    db: AsyncSession,
) -> UserProfileResponse:
    """Update user profile fields."""
    update_data = data.model_dump(exclude_unset=True, exclude_none=True)

    for field, value in update_data.items():
        setattr(user, field, value)

    await db.flush()
    logger.info("profile_updated", extra={"user_id": str(user.id), "fields": list(update_data.keys())})
    return await get_profile(user)


async def change_password(
    user: User,
    data: ChangePasswordRequest,
    db: AsyncSession,
) -> MessageResponse:
    """Change password — requires current password verification."""
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    user.password_hash = hash_password(data.new_password)
    await db.flush()
    logger.info("password_changed", extra={"user_id": str(user.id)})
    return MessageResponse(message="Password changed successfully")


# ── Pause / Resume (Sick Mode) ────────────────────────────────


async def pause_account(
    user: User,
    data: PauseRequest,
    db: AsyncSession,
) -> UserProfileResponse:
    """Activate sick mode / vacation freeze."""
    if user.paused_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account is already paused",
        )

    now = datetime.now(timezone.utc)
    user.paused_at = now
    user.paused_reason = data.reason

    if data.days:
        user.paused_until = now + timedelta(days=data.days)
    else:
        user.paused_until = None  # indefinite until manual resume

    # Shift goal deadlines forward
    result = await db.execute(
        select(Goal).where(
            and_(
                Goal.user_id == user.id,
                Goal.status == "active",
                Goal.deleted_at.is_(None),
            )
        )
    )
    for goal in result.scalars().all():
        if data.days:
            goal.target_date = goal.target_date + timedelta(days=data.days)

    await db.flush()
    logger.info("account_paused", extra={
        "user_id": str(user.id), "reason": data.reason, "days": data.days,
    })
    return await get_profile(user)


async def resume_account(
    user: User,
    db: AsyncSession,
) -> UserProfileResponse:
    """Deactivate pause / sick mode."""
    if user.paused_at is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account is not paused",
        )

    pause_duration = (datetime.now(timezone.utc) - user.paused_at).days

    # If no pre-set days, shift goal deadlines by actual pause duration
    result = await db.execute(
        select(Goal).where(
            and_(
                Goal.user_id == user.id,
                Goal.status == "active",
                Goal.deleted_at.is_(None),
            )
        )
    )
    if user.paused_until is None:
        # Indefinite pause — shift by actual duration
        for goal in result.scalars().all():
            goal.target_date = goal.target_date + timedelta(days=pause_duration)

    user.paused_at = None
    user.paused_until = None
    user.paused_reason = None

    await db.flush()
    logger.info("account_resumed", extra={
        "user_id": str(user.id), "pause_days": pause_duration,
    })
    return await get_profile(user)


# ── Feedback ──────────────────────────────────────────────────


async def submit_feedback(
    user: User,
    data: FeedbackRequest,
    db: AsyncSession,
) -> FeedbackResponse:
    """Submit user feedback or bug report."""
    feedback = Feedback(
        user_id=user.id,
        feedback_type=data.feedback_type,
        message=data.message,
        screen_state=data.screen_state,
        device_info=data.device_info,
        request_ids=data.request_ids,
    )
    db.add(feedback)
    await db.flush()

    logger.info("feedback_submitted", extra={
        "user_id": str(user.id), "type": data.feedback_type,
    })

    return FeedbackResponse(
        id=feedback.id,
        feedback_type=feedback.feedback_type,
        message=feedback.message,
        created_at=feedback.created_at.isoformat(),
    )


# ── Day Score ─────────────────────────────────────────────────


async def calculate_day_score(
    user_id: uuid.UUID,
    target_date: date,
    db: AsyncSession,
) -> DayScoreResponse:
    """
    Calculate a holistic day score (0-100).
    Components:
    - Completion rate (40%)
    - Stuck to timing (20%)
    - Completed Core tasks (20%)
    - Mood (10%)
    - Streak bonus (10%)
    """
    # Get daily log
    result = await db.execute(
        select(DailyLog).where(
            and_(DailyLog.user_id == user_id, DailyLog.log_date == target_date)
        )
    )
    daily_log = result.scalar_one_or_none()

    if not daily_log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No daily log found for {target_date.isoformat()}",
        )

    # Completion score (0-40)
    completion_rate = daily_log.completion_rate or 0.0
    completion_score = min(40, int(completion_rate * 40))

    # Core tasks score (0-20)
    tasks_result = await db.execute(
        select(Task).where(
            and_(
                Task.user_id == user_id,
                Task.schedule_id == daily_log.schedule_id,
                Task.is_mvp_task.is_(True),
                Task.deleted_at.is_(None),
            )
        )
    )
    core_tasks = tasks_result.scalars().all()
    core_completed = sum(1 for t in core_tasks if t.task_status == "completed")
    core_total = len(core_tasks)
    core_tasks_score = min(20, int((core_completed / core_total * 20) if core_total > 0 else 10))

    # Timing score (0-20) — based on completion vs scheduled ratio
    timing_score = min(20, int(completion_rate * 20))

    # Streak bonus (0-10)
    streak_days = await _count_current_streak(user_id, target_date, db)
    streak_bonus = min(10, streak_days)

    # Mood bonus (0-10) — from mood_score (1-5 → 0-10)
    mood_score = daily_log.mood_score or 3
    mood_bonus = (mood_score - 1) * 2  # 1→0, 2→2, 3→4, 4→6, 5→8

    # But cap it — mood_bonus max is 10 minus streak contribution
    # Actually keep it simple: mood contributes up to 10
    mood_component = min(10, mood_bonus + (2 if streak_days > 0 else 0))

    total = completion_score + timing_score + core_tasks_score + streak_bonus
    total = min(100, total + mood_component)

    return DayScoreResponse(
        date=target_date.isoformat(),
        total_score=total,
        completion_score=completion_score,
        timing_score=timing_score,
        core_tasks_score=core_tasks_score,
        streak_bonus=streak_bonus,
        breakdown={
            "completion_rate": round(completion_rate, 3),
            "core_completed": core_completed,
            "core_total": core_total,
            "streak_days": streak_days,
            "mood_score": mood_score,
        },
    )


# ── Account Deletion ──────────────────────────────────────────


async def delete_account(
    user: User,
    db: AsyncSession,
) -> MessageResponse:
    """
    GDPR-compliant account deletion.
    Cascades to all user data via FK ondelete="CASCADE".
    """
    user_id = user.id
    await db.delete(user)
    await db.flush()
    logger.info("account_deleted", extra={"user_id": str(user_id)})
    return MessageResponse(message="Account and all associated data deleted successfully")


# ── Data Export ───────────────────────────────────────────────


async def export_user_data(
    user: User,
    db: AsyncSession,
) -> dict:
    """Export all user data as a JSON-serializable dict."""
    # Goals
    goals_result = await db.execute(
        select(Goal).where(Goal.user_id == user.id).order_by(Goal.created_at)
    )
    goals = [
        {"id": str(g.id), "title": g.title, "goal_type": g.goal_type,
         "status": g.status, "target_date": g.target_date.isoformat(),
         "created_at": g.created_at.isoformat()}
        for g in goals_result.scalars().all()
    ]

    # Tasks
    tasks_result = await db.execute(
        select(Task).where(Task.user_id == user.id).order_by(Task.created_at)
    )
    tasks = [
        {"id": str(t.id), "title": t.title, "task_type": t.task_type,
         "task_status": t.task_status, "duration_mins": t.duration_mins,
         "created_at": t.created_at.isoformat()}
        for t in tasks_result.scalars().all()
    ]

    # Daily logs
    logs_result = await db.execute(
        select(DailyLog).where(DailyLog.user_id == user.id).order_by(DailyLog.log_date)
    )
    daily_logs = [
        {"log_date": log_entry.log_date.isoformat(),
         "morning_energy": log_entry.morning_energy,
         "completion_rate": log_entry.completion_rate,
         "mood_score": log_entry.mood_score}
        for log_entry in logs_result.scalars().all()
    ]

    return {
        "user": {
            "id": str(user.id),
            "name": user.name,
            "email": user.email,
            "timezone": user.timezone,
            "created_at": user.created_at.isoformat(),
        },
        "goals": goals,
        "tasks": tasks,
        "daily_logs": daily_logs,
        "exported_at": datetime.now(timezone.utc).isoformat(),
    }


# ── Private helpers ───────────────────────────────────────────


async def _count_current_streak(
    user_id: uuid.UUID,
    as_of: date,
    db: AsyncSession,
) -> int:
    """Count consecutive days of >60% completion rate ending at as_of."""
    result = await db.execute(
        select(DailyLog)
        .where(
            and_(
                DailyLog.user_id == user_id,
                DailyLog.log_date <= as_of,
                DailyLog.completion_rate.isnot(None),
            )
        )
        .order_by(DailyLog.log_date.desc())
        .limit(90)
    )
    logs = result.scalars().all()

    streak = 0
    expected_date = as_of
    for log in logs:
        if log.log_date != expected_date:
            break
        if (log.completion_rate or 0.0) >= 0.6:
            streak += 1
            expected_date = expected_date - timedelta(days=1)
        else:
            break

    return streak
