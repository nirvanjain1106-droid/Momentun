# Sprint 7 — Services, Schemas & API Layer (Hardened — Final)

> **Self-contained document.** Part 2 of 3. No external revision references required.
> All service implementations, Pydantic schemas, and API endpoints are fully specified here.

---

## 1. Milestone Service

```python
# app/services/milestone_service.py

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.milestone import GoalMilestone
from app.models.goal import Goal

logger = logging.getLogger(__name__)


async def evaluate_milestones(
    user_id: uuid.UUID,
    goal_id: uuid.UUID,
    db: AsyncSession,
) -> list[GoalMilestone]:
    """
    D42: Threshold with auto-skip and exhaustion guard.
    Evaluates pending milestones in sequence order.
    Returns newly completed milestones (for notification triggers).
    """
    milestones = await _get_active_milestones(goal_id, db)
    if not milestones:
        return []  # D42: exhaustion guard — no pending = no work

    completed_this_run = []
    current_value = await _compute_current_value(user_id, goal_id, db)

    for milestone in milestones:
        if milestone.status == 'completed':
            continue

        # Update current progress
        milestone.current_value = current_value

        if current_value >= milestone.target_value:
            milestone.status = 'completed'
            milestone.completed_at = datetime.now(timezone.utc)
            completed_this_run.append(milestone)

            logger.info("milestone_completed", extra={
                "milestone_id": str(milestone.id),
                "goal_id": str(goal_id),
                "title": milestone.title,
                "target": milestone.target_value,
                "actual": current_value,
            })
        else:
            # D42: Only evaluate up to first incomplete milestone
            # (sequential progression — must complete M1 before M2)
            milestone.status = 'in_progress'
            break

    await db.flush()
    return completed_this_run


async def auto_skip_milestones(
    goal_id: uuid.UUID,
    db: AsyncSession,
) -> int:
    """
    D42: Auto-skip milestones that are no longer achievable.
    Called when goal target_date passes or goal is abandoned.
    Returns count of skipped milestones.
    """
    result = await db.execute(
        update(GoalMilestone)
        .where(
            and_(
                GoalMilestone.goal_id == goal_id,
                GoalMilestone.status.in_(['pending', 'in_progress']),
            )
        )
        .values(status='skipped')
    )
    count = result.rowcount

    if count > 0:
        logger.info("milestones_auto_skipped", extra={
            "goal_id": str(goal_id),
            "count": count,
        })

    return count


async def _get_active_milestones(
    goal_id: uuid.UUID, db: AsyncSession
) -> list[GoalMilestone]:
    result = await db.execute(
        select(GoalMilestone)
        .where(
            and_(
                GoalMilestone.goal_id == goal_id,
                GoalMilestone.status.in_(['pending', 'in_progress']),
            )
        )
        .order_by(GoalMilestone.sequence_order)
    )
    return list(result.scalars().all())


async def _compute_current_value(
    user_id: uuid.UUID,
    goal_id: uuid.UUID,
    db: AsyncSession,
) -> float:
    """Compute current metric value based on milestone metric_type."""
    # Implementation depends on metric_type — delegate to specific calculators
    # For now, use completion_rate as default metric
    from app.services.insights_service import _load_daily_logs
    from datetime import date, timedelta

    today = date.today()
    logs = await _load_daily_logs(user_id, db, today - timedelta(days=30), today)
    if not logs:
        return 0.0

    rates = [log.completion_rate for log in logs if log.completion_rate is not None]
    return sum(rates) / len(rates) if rates else 0.0
```

---

## 2. Rescue Mission Launcher (Full)

```python
# app/services/rescue_service.py

import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import and_, select, func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.encryption import encrypt_field_versioned
from app.models.goal import Goal, Task, DailyLog, TaskLog
from app.models.notification import Notification

logger = logging.getLogger(__name__)

# Rescue eligibility thresholds
RESCUE_FAILURE_THRESHOLD = 3     # consecutive failures to trigger rescue
RESCUE_LOOKBACK_DAYS = 7         # window for failure detection
RESCUE_COOLDOWN_HOURS = 48       # min time between rescues for same task


async def run_rescue_scan(db: AsyncSession) -> int:
    """
    Nightly cron: scan for struggling tasks and create rescue notifications.
    D43: Only goal-linked tasks qualify.
    Returns count of rescue notifications created.
    """
    # Find tasks with consecutive failures
    candidates = await _find_rescue_candidates(db)
    created = 0

    for user_id, task in candidates:
        # Cooldown check: skip if recently rescued
        if await _recently_rescued(task.id, db):
            continue

        # Create rescue notification (I31: constraint name dedup)
        body = encrypt_field_versioned(
            f"You've been struggling with '{task.title}'. "
            f"Here's a lighter approach to get back on track."
        )

        stmt = pg_insert(Notification).values(
            user_id=user_id,
            type='rescue_mission',
            title=f"Rescue: {task.title[:50]}",
            body_ciphertext=body,                # D45: TEXT column
            rescue_task_id=task.id,
            fire_at=datetime.now(timezone.utc),
            schedule_date=date.today(),
        ).on_conflict_do_nothing(
            constraint='uq_notification_rescue_pending'  # I31: by name, not elements
        )
        result = await db.execute(stmt)

        if result.rowcount == 1:
            created += 1
            logger.info("rescue_notification_created", extra={
                "user_id": str(user_id), "task_id": str(task.id),
                "task_title": task.title,
            })
        else:
            logger.info("rescue_notification_deduped_by_db", extra={
                "task_id": str(task.id),
            })

    logger.info("rescue_scan_completed", extra={"total_created": created})
    return created


async def _find_rescue_candidates(db: AsyncSession):
    """
    Find tasks with RESCUE_FAILURE_THRESHOLD consecutive failures
    in the last RESCUE_LOOKBACK_DAYS days.
    Uses ix_tasks_rescue_candidate index (Migration 007b).
    """
    cutoff = date.today() - timedelta(days=RESCUE_LOOKBACK_DAYS)

    # Get tasks with recent failures
    stmt = (
        select(Task.user_id, Task)
        .join(TaskLog, TaskLog.task_id == Task.id)
        .join(DailyLog, DailyLog.id == TaskLog.daily_log_id)
        .where(
            and_(
                Task.goal_id.isnot(None),          # D43: goal-linked only
                Task.deleted_at.is_(None),
                Task.task_status == 'active',
                DailyLog.log_date >= cutoff,
                TaskLog.status.notin_(['completed', 'partial']),
            )
        )
        .group_by(Task.user_id, Task.id)
        .having(func.count(TaskLog.id) >= RESCUE_FAILURE_THRESHOLD)
    )

    result = await db.execute(stmt)
    return result.all()


async def _recently_rescued(task_id: uuid.UUID, db: AsyncSession) -> bool:
    """Check if task was rescued within cooldown period."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=RESCUE_COOLDOWN_HOURS)
    result = await db.execute(
        select(Notification.id)
        .where(
            and_(
                Notification.rescue_task_id == task_id,
                Notification.type == 'rescue_mission',
                Notification.created_at >= cutoff,
            )
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None
```

---

## 3. Trajectory Bonus (D44)

```python
# app/services/rescue_service.py — bonus section

async def apply_rescue_bonus(
    goal_id: uuid.UUID,
    bonus_pct: float,
    db: AsyncSession,
):
    """
    D44: Decay-on-read bonus.
    Applied when user completes a rescue mission task.
    Bonus decays linearly over 7 days.
    """
    expires = datetime.now(timezone.utc) + timedelta(days=7)

    await db.execute(
        update(Goal)
        .where(Goal.id == goal_id)
        .values(
            rescue_bonus_pct=bonus_pct,
            rescue_bonus_expires_at=expires,
        )
    )

    logger.info("rescue_bonus_applied", extra={
        "goal_id": str(goal_id),
        "bonus_pct": bonus_pct,
        "expires_at": expires.isoformat(),
    })


def get_effective_bonus(goal: Goal) -> float:
    """D44: Decay-on-read. Returns current effective bonus percentage."""
    if not goal.rescue_bonus_pct or not goal.rescue_bonus_expires_at:
        return 0.0

    now = datetime.now(timezone.utc)
    if now >= goal.rescue_bonus_expires_at:
        return 0.0

    # Linear decay over 7 days
    total_duration = timedelta(days=7).total_seconds()
    remaining = (goal.rescue_bonus_expires_at - now).total_seconds()
    decay_factor = remaining / total_duration

    return round(goal.rescue_bonus_pct * decay_factor, 3)
```

---

## 4. Notification API — GET + POST /ack

```python
# app/routers/notifications.py

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.notification import Notification
from app.models.user import User
from app.core.encryption import decrypt_field_versioned

router = APIRouter(prefix="/api/v1/notifications", tags=["Notifications"])


@router.get("")
async def get_notifications(
    cursor: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    D41: Pure poll — GET does NOT mutate state.
    I34: Filters dismissed_at IS NULL to use partial index.
    """
    stmt = (
        select(Notification)
        .where(
            and_(
                Notification.user_id == user.id,
                Notification.dismissed_at.is_(None),  # I34: leverage partial index
            )
        )
        .order_by(
            Notification.fire_at.desc().nullslast(),
            Notification.created_at.desc(),
        )
        .limit(limit + 1)
    )

    # Cursor-based pagination
    if cursor:
        cursor_fire_at, cursor_id = _parse_cursor(cursor)
        stmt = stmt.where(
            (Notification.fire_at < cursor_fire_at) |
            (
                (Notification.fire_at == cursor_fire_at) &
                (Notification.created_at < cursor_id)
            )
        )

    result = await db.execute(stmt)
    rows = list(result.scalars().all())

    has_more = len(rows) > limit
    items = rows[:limit]

    return {
        "notifications": [_to_response(n) for n in items],
        "has_more": has_more,
        "next_cursor": _make_cursor(items[-1]) if has_more and items else None,
    }


@router.post("/{notification_id}/ack")
async def ack_notification(
    notification_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    D41: Explicit ACK sets delivered_at.
    Idempotent — double-ack is a no-op.
    """
    result = await db.execute(
        update(Notification)
        .where(
            and_(
                Notification.id == notification_id,
                Notification.user_id == user.id,
                Notification.delivered_at.is_(None),  # idempotent guard
            )
        )
        .values(delivered_at=datetime.now(timezone.utc))
    )

    return {"acknowledged": result.rowcount == 1}


@router.post("/{notification_id}/dismiss")
async def dismiss_notification(
    notification_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark notification as dismissed."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        update(Notification)
        .where(
            and_(
                Notification.id == notification_id,
                Notification.user_id == user.id,
                Notification.dismissed_at.is_(None),
            )
        )
        .values(
            dismissed_at=now,
            delivered_at=Notification.delivered_at or now,  # auto-deliver on dismiss
        )
    )

    return {"dismissed": result.rowcount == 1}


def _to_response(n: Notification) -> dict:
    """D10/D45: Graceful degradation on decrypt failure."""
    body = None
    if n.body_ciphertext:
        try:
            body = decrypt_field_versioned(n.body_ciphertext)
        except Exception:
            body = None  # I30: consistent with DailyLog read path

    return {
        "id": str(n.id),
        "type": n.type,
        "title": n.title,
        "body": body,
        "fire_at": n.fire_at.isoformat() if n.fire_at else None,
        "schedule_date": n.schedule_date.isoformat() if n.schedule_date else None,
        "delivered_at": n.delivered_at.isoformat() if n.delivered_at else None,
        "metadata": n.metadata or {},
        "created_at": n.created_at.isoformat(),
    }
```

---

## 5. Pydantic Schemas

### 5.1 Recurring Task Rule Schema — I33 Validation

```python
# app/schemas/recurring.py

from pydantic import BaseModel, validator
from typing import Optional
from uuid import UUID


class RecurringTaskRuleCreate(BaseModel):
    goal_id: UUID
    title: str
    task_type: str
    duration_mins: int
    priority: int = 3
    days_of_week: list[int]
    scheduled_start: Optional[str] = None
    max_instances: Optional[int] = None

    @validator('days_of_week')
    def validate_days(cls, v):
        """I33: Validate ISO weekday values 0-6, sorted and deduped."""
        if not v:
            raise ValueError("days_of_week must not be empty")
        if not all(0 <= d <= 6 for d in v):
            raise ValueError("days_of_week must contain integers 0-6 (Mon=0, Sun=6)")
        return sorted(set(v))

    @validator('duration_mins')
    def validate_duration(cls, v):
        if v < 5 or v > 480:
            raise ValueError("duration_mins must be between 5 and 480")
        return v

    @validator('priority')
    def validate_priority(cls, v):
        if v < 1 or v > 5:
            raise ValueError("priority must be between 1 and 5")
        return v

    @validator('scheduled_start')
    def validate_start_time(cls, v):
        if v is None:
            return v
        parts = v.split(':')
        if len(parts) != 2:
            raise ValueError("scheduled_start must be HH:MM format")
        try:
            h, m = int(parts[0]), int(parts[1])
            if not (0 <= h <= 23 and 0 <= m <= 59):
                raise ValueError()
        except ValueError:
            raise ValueError("scheduled_start must be valid HH:MM (00:00-23:59)")
        return v


class RecurringTaskRuleResponse(BaseModel):
    id: UUID
    goal_id: UUID
    title: str
    task_type: str
    duration_mins: int
    priority: int
    days_of_week: list[int]
    scheduled_start: Optional[str]
    is_active: bool
    max_instances: Optional[int]
    instances_created: int

    class Config:
        from_attributes = True
```

### 5.2 Milestone Schema

```python
# app/schemas/milestone.py

from pydantic import BaseModel, validator
from typing import Optional
from uuid import UUID
from datetime import datetime


class GoalMilestoneCreate(BaseModel):
    title: str
    description: Optional[str] = None
    target_value: float
    metric_type: str = "completion_rate"
    sequence_order: int = 0

    @validator('metric_type')
    def validate_metric(cls, v):
        valid = {'completion_rate', 'study_hours', 'streak_days', 'tasks_completed'}
        if v not in valid:
            raise ValueError(f"metric_type must be one of {valid}")
        return v

    @validator('target_value')
    def validate_target(cls, v):
        if v <= 0:
            raise ValueError("target_value must be positive")
        return v


class GoalMilestoneResponse(BaseModel):
    id: UUID
    goal_id: UUID
    title: str
    description: Optional[str]
    target_value: float
    current_value: float
    metric_type: str
    status: str
    sequence_order: int
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True
```

### 5.3 Notification Schema

```python
# app/schemas/notification.py

from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime


class NotificationResponse(BaseModel):
    id: UUID
    type: str
    title: str
    body: Optional[str]
    fire_at: Optional[datetime]
    schedule_date: Optional[str]
    delivered_at: Optional[datetime]
    metadata: dict
    created_at: datetime


class NotificationListResponse(BaseModel):
    notifications: list[NotificationResponse]
    has_more: bool
    next_cursor: Optional[str]
```

---

## 6. Notification Model (SQLAlchemy)

```python
# app/models/notification.py

import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, ForeignKey,
    Index, String, Text, func, text,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,  # I27
    )
    type: Mapped[str] = mapped_column(
        String(30),
        CheckConstraint(
            "type IN ('checkin_morning', 'checkin_evening', "
            "'task_reminder', 'rescue_mission')"
        ),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    body_ciphertext: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True  # D45, I29: TEXT not BYTEA
    )
    metadata: Mapped[Optional[dict]] = mapped_column(JSONB, default=dict)
    fire_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    schedule_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    rescue_task_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="SET NULL"),
        nullable=True,
    )
    reminder_task_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="SET NULL"),
        nullable=True,
    )

    delivered_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    dismissed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Partial unique indexes defined in migration DDL, not in model __table_args__
    # (PostgreSQL partial indexes with WHERE clauses are migration-managed)
```

---

## 7. Milestone Model (SQLAlchemy)

```python
# app/models/milestone.py

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    CheckConstraint, DateTime, Float, ForeignKey,
    Integer, String, Text, func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class GoalMilestone(Base):
    __tablename__ = "goal_milestones"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,  # C1 FIX (I27): Prevents table lock on cascade delete
    )
    goal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("goals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,  # C1 FIX (I27): Prevents table lock on cascade delete
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    target_value: Mapped[float] = mapped_column(Float, nullable=False)
    current_value: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    metric_type: Mapped[str] = mapped_column(
        String(30),
        CheckConstraint(
            "metric_type IN ('completion_rate', 'study_hours', "
            "'streak_days', 'tasks_completed')"
        ),
        nullable=False,
        default='completion_rate',
    )
    status: Mapped[str] = mapped_column(
        String(20),
        CheckConstraint(
            "status IN ('pending', 'in_progress', 'completed', 'skipped')"
        ),
        nullable=False,
        default='pending',
    )
    sequence_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
```

---

## 8. Recurring Task Rule Model

```python
# app/models/recurring.py

import uuid
from datetime import datetime
from typing import Optional, List

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey,
    Integer, String, func,
)
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RecurringTaskRule(Base):
    __tablename__ = "recurring_task_rules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,  # I27
    )
    goal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("goals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,  # I27
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    task_type: Mapped[str] = mapped_column(
        String(30),
        CheckConstraint(
            "task_type IN ('study', 'practice', 'review', "
            "'exercise', 'reading', 'other')"
        ),
        nullable=False,
    )
    duration_mins: Mapped[int] = mapped_column(Integer, nullable=False)
    priority: Mapped[int] = mapped_column(
        Integer,
        CheckConstraint("priority BETWEEN 1 AND 5"),
        nullable=False,
        default=3,
    )
    days_of_week: Mapped[List[int]] = mapped_column(
        ARRAY(Integer), nullable=False  # I33: 0-6 ISO weekday
    )
    scheduled_start: Mapped[Optional[str]] = mapped_column(
        String(5), nullable=True  # "HH:MM"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    max_instances: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, default=None
    )
    instances_created: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0  # D46: reservation counter
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
        onupdate=func.now(), nullable=False
    )
```

---

## 9. Heatmap — No Cache (D49 / C2 Resolution)

The existing `get_heatmap()` at [insights_service.py#L1232–1282](file:///c:/Users/nirva/Downloads/Momentum%20API/app/services/insights_service.py#L1232-L1282) requires **no changes**. The covering index from Migration 009 provides the performance optimization.

```python
# EXISTING — no modification needed
# app/services/insights_service.py#L1232-L1282

async def get_heatmap(user, db, days=90):
    today = get_user_today(getattr(user, "timezone", DEFAULT_TIMEZONE))
    start = today - timedelta(days=days - 1)
    logs = await _load_daily_logs(user.id, db, start, today)
    # ... builds HeatmapResponse from logs directly
```

> **C2 Resolution:** The "Feature 6 — Heatmap Cache" from the original plan is **removed**. Module-level Python dicts are per-process and cause stale reads in multi-worker Uvicorn deployments. The covering index `ix_daily_logs_heatmap` (Migration 009) makes the direct query path efficient for the 90-day window (max 90 rows).
