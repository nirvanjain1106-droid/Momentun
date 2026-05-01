"""
Notification Service — Sprint 7

Rescue missions, task reminders, milestone alerts.
"""

import uuid
import logging
from datetime import datetime, timezone

from sqlalchemy import func, and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.goal import Task, Notification
from app.core.config import settings

logger = logging.getLogger(__name__)


async def _evaluate_rescue_candidate(
    goal, user_id: uuid.UUID, db: AsyncSession
) -> bool:
    """Per-goal completion-rate based rescue evaluation.

    Replaces user-wide DailyLog aggregation (P1 fix — §9b).
    Returns True if the goal's task completion rate is below the threshold.
    """
    total_result = await db.execute(
        select(func.count(Task.id)).where(
            and_(
                Task.goal_id == goal.id,
                Task.user_id == user_id,
                Task.deleted_at.is_(None),
            )
        )
    )
    total = total_result.scalar() or 0
    if total == 0:
        return False  # No tasks → no rescue needed

    completed_result = await db.execute(
        select(func.count(Task.id)).where(
            and_(
                Task.goal_id == goal.id,
                Task.user_id == user_id,
                Task.task_status == "completed",
                Task.deleted_at.is_(None),
            )
        )
    )
    completed = completed_result.scalar() or 0
    rate = completed / max(total, 1) * 100
    # D59: threshold from config — not hardcoded
    return rate < settings.rescue_threshold_pct


async def create_rescue_notification(
    goal, user_id: uuid.UUID, db: AsyncSession
) -> Notification | None:
    """Evaluate and create a rescue mission notification for a goal.

    Returns Notification if created, None if not needed.
    """
    # D52: Rescue dedup uses UTC midnight boundary (not user-local midnight).
    # v1 trade-off: a user in UTC-8 can receive up to 2 rescues within their
    # "same day" if they span UTC midnight. Accepted for v1 simplicity.
    if not goal or not goal.id:
        raise ValueError("Rescue mission requires a valid goal_id — cannot create notification")

    if not await _evaluate_rescue_candidate(goal, user_id, db):
        return None

    notification = Notification(
        user_id=user_id,
        goal_id=goal.id,
        type="rescue_mission",
        title=f"Rescue mission for {goal.title}",
        fire_at_utc=datetime.now(timezone.utc),
    )
    db.add(notification)
    return notification
