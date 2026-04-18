from __future__ import annotations
import uuid
from datetime import date, datetime
from typing import Optional, List, TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.user import User


from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime,
    ForeignKey, Integer, String, Text, func, Index, text,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    goal_type: Mapped[str] = mapped_column(
        String(30),
        CheckConstraint(
            "goal_type IN ('exam', 'fitness', 'skill', 'project', 'habit', 'other')"
        ),
        nullable=False,
    )
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    target_date: Mapped[date] = mapped_column(Date, nullable=False)

    # Motivation context — used for personalised nudges
    motivation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    consequence: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    success_metric: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(
        String(20),
        CheckConstraint(
            "status IN ('active', 'achieved', 'abandoned', 'paused')"
        ),
        default="active",
        nullable=False,
    )

    # Multi-goal rank — only populated when status='active'
    # NULL for paused/achieved/abandoned goals
    priority_rank: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, default=None,
    )
    # Snapshot of rank before pause — informational for frontend (v1)
    pre_pause_rank: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, default=None,
    )

    # Goal-specific flexible data
    # exam:    {"subjects": [...], "weak_subjects": [...], "exam_pattern": "MCQ"}
    # fitness: {"goal_type": "muscle_gain", "equipment": "gym", ...}
    goal_metadata: Mapped[Optional[dict]] = mapped_column("metadata", JSONB, default=dict)

    # Soft delete
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    user: Mapped[User] = relationship(back_populates="goals")
    detected_patterns: Mapped[List["DetectedPattern"]] = relationship(
        back_populates="goal", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index(
            "uq_goal_rank_per_user",
            "user_id", "priority_rank",
            unique=True,
            postgresql_where=text("status='active' AND deleted_at IS NULL")
        ),
    )

    # Partial unique index enforced in migration 005_multi_goal_portfolio:
    # uq_goal_rank_per_user ON goals(user_id, priority_rank) WHERE status='active' AND deleted_at IS NULL
    # CHECK constraint (bidirectional):
    #   active goals MUST have non-NULL priority_rank
    #   inactive goals MUST have NULL priority_rank


class FixedBlock(Base):
    """
    Immovable time commitments — college hours, meals, sleep, etc.
    These are the constraints the scheduler works around.
    """
    __tablename__ = "fixed_blocks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    title: Mapped[str] = mapped_column(String(100), nullable=False)
    block_type: Mapped[str] = mapped_column(
        String(30),
        CheckConstraint(
            "block_type IN ("
            "'sleep', 'meal', 'college', 'travel', "
            "'hygiene', 'prayer', 'family', 'commute', 'other')"
        ),
        nullable=False,
    )

    # Which days this block applies — array of integers
    # 1=Sun, 2=Mon, 3=Tue, 4=Wed, 5=Thu, 6=Fri, 7=Sat
    applies_to_days: Mapped[List[int]] = mapped_column(
        ARRAY(Integer), nullable=False
    )

    start_time: Mapped[str] = mapped_column(String(5), nullable=False)  # "HH:MM"
    end_time: Mapped[str] = mapped_column(String(5), nullable=False)    # "HH:MM"

    is_hard_constraint: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )

    # Buffer around the block (in minutes)
    buffer_before: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    buffer_after: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Date range validity — NULL means always active
    valid_from: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    valid_until: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # Seasonal labels
    is_seasonal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    season_label: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationship
    user: Mapped[User] = relationship(back_populates="fixed_blocks")


class WeeklyPlan(Base):
    """Portfolio-level weekly narrative container (no longer goal-scoped)."""
    __tablename__ = "weekly_plans"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # goal_id removed — weekly plans are now portfolio-level (Commit 3)

    week_start_date: Mapped[date] = mapped_column(Date, nullable=False)  # Monday
    week_end_date: Mapped[date] = mapped_column(Date, nullable=False)    # Sunday

    week_theme: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    strategy_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Context at time of generation
    overall_completion_at_generation: Mapped[Optional[float]] = mapped_column(
        nullable=True
    )
    days_remaining_at_generation: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True
    )

    status: Mapped[str] = mapped_column(
        String(20),
        CheckConstraint(
            "status IN ('upcoming', 'active', 'completed', 'abandoned')"
        ),
        default="upcoming",
        nullable=False,
    )

    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )

    # Relationships
    schedules: Mapped[List["Schedule"]] = relationship(
        back_populates="weekly_plan", cascade="all, delete-orphan"
    )


class Schedule(Base):
    """Portfolio-level daily schedule (no longer goal-scoped)."""
    __tablename__ = "schedules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # goal_id removed — schedule is now portfolio-scoped (user-day) (Commit 3)
    weekly_plan_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("weekly_plans.id", ondelete="SET NULL"),
        nullable=True,
    )

    schedule_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    day_type: Mapped[str] = mapped_column(
        String(30),
        CheckConstraint(
            "day_type IN ("
            "'standard', 'stretch', 'minimum_viable', "
            "'recovery', 'compressed')"
        ),
        default="standard",
        nullable=False,
    )
    day_type_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    strategy_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    generated_by: Mapped[str] = mapped_column(
        String(20), default="ai", nullable=False
    )
    model_used: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    generation_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Stale flag — lazy invalidation for schedule regeneration
    is_stale: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
    )
    # Regeneration lock — prevents concurrent solver runs
    is_regenerating: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
    )
    # Timestamp for crash recovery — if is_regenerating=True and this is >60s ago,
    # the lock is force-released on next fetch
    regeneration_started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None,
    )

    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Uniqueness enforced in migration 001_initial_schema:
    # uq_one_schedule_per_user_per_date ON schedules(user_id, schedule_date) WHERE deleted_at IS NULL
    __table_args__ = (
        Index(
            "uq_one_schedule_per_user_per_date",
            "user_id", "schedule_date",
            unique=True,
            postgresql_where=text("deleted_at IS NULL")
        ),
    )

    # Relationships
    weekly_plan: Mapped[Optional["WeeklyPlan"]] = relationship(
        back_populates="schedules"
    )
    tasks: Mapped[List["Task"]] = relationship(
        back_populates="schedule", cascade="all, delete-orphan"
    )
    daily_log: Mapped[Optional["DailyLog"]] = relationship(
        back_populates="schedule", uselist=False
    )


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # nullable — parked tasks have no schedule
    schedule_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("schedules.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    goal_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("goals.id", ondelete="SET NULL"),
        nullable=True,
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    task_type: Mapped[str] = mapped_column(
        String(30),
        CheckConstraint(
            "task_type IN ("
            "'deep_study', 'light_review', 'exercise', "
            "'practice', 'revision', 'break', 'admin', 'other', 'general')"
        ),
        nullable=False,
    )

    # Nullable for deferred/parked tasks (no scheduled time yet) — Fix #14
    scheduled_start: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    scheduled_end: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    duration_mins: Mapped[int] = mapped_column(Integer, nullable=False)

    energy_required: Mapped[str] = mapped_column(
        String(10),
        CheckConstraint("energy_required IN ('high', 'medium', 'low')"),
        nullable=False,
    )

    # Priority: 1=Core(MVP), 2=Normal, 3=Bonus
    priority: Mapped[int] = mapped_column(
        Integer,
        CheckConstraint("priority BETWEEN 1 AND 3"),
        nullable=False,
    )

    # True when priority == 1 (Core)
    is_mvp_task: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    sequence_order: Mapped[int] = mapped_column(Integer, nullable=False)

    # Fix #6 — task lifecycle for Later
    # active = on today schedule
    # deferred = solver dropped it, saved for later
    # parked = manually parked by user
    # completed = done (detailed log in task_logs)
    task_status: Mapped[str] = mapped_column(
        String(20),
        CheckConstraint(
            "task_status IN ('active', 'deferred', 'parked', 'completed', 'expired')"
        ),
        nullable=False,
        default="active",
        server_default="active",
    )
    previous_status: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True, default=None,
    )
    # Snapshot of the goal's rank when this task was scheduled (Commit 3)
    goal_rank_snapshot: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, default=None,
    )
    slot_reasons: Mapped[Optional[list]] = mapped_column(
        JSONB, nullable=True, default=None,
    )

    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    schedule: Mapped["Schedule"] = relationship(back_populates="tasks")
    task_logs: Mapped[List["TaskLog"]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )


class DailyLog(Base):
    __tablename__ = "daily_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    schedule_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("schedules.id", ondelete="SET NULL"),
        nullable=True,
    )
    log_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # Morning check-in
    morning_energy: Mapped[Optional[str]] = mapped_column(
        String(10),
        CheckConstraint(
            "morning_energy IN ('high', 'medium', 'low', 'exhausted')"
        ),
        nullable=True,
    )
    yesterday_rating: Mapped[Optional[str]] = mapped_column(
        String(20),
        CheckConstraint(
            "yesterday_rating IN ("
            "'crushed_it', 'decent', 'rough', 'barely_survived')"
        ),
        nullable=True,
    )
    surprise_event: Mapped[Optional[str]] = mapped_column(
        String(50),
        CheckConstraint(
            "surprise_event IN ("
            "'none', 'family_event', 'sick', 'college_extra', "
            "'power_cut', 'travel', 'other')"
        ),
        nullable=True,
    )
    surprise_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Evening review
    tasks_scheduled: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    tasks_completed: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    completion_rate: Mapped[Optional[float]] = mapped_column(nullable=True)
    mood_score: Mapped[Optional[int]] = mapped_column(
        Integer,
        CheckConstraint("mood_score BETWEEN 1 AND 5"),
        nullable=True,
    )
    evening_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    actual_day_type: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    # Timestamps
    morning_checkin_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    evening_review_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index(
            "uq_one_log_per_user_per_date",
            "user_id", "log_date",
            unique=True
        ),
    )

    # Relationships
    schedule: Mapped[Optional["Schedule"]] = relationship(back_populates="daily_log")
    task_logs: Mapped[List["TaskLog"]] = relationship(
        back_populates="daily_log", cascade="all, delete-orphan"
    )


class TaskLog(Base):
    __tablename__ = "task_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    daily_log_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("daily_logs.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        CheckConstraint(
            "status IN ('completed', 'partial', 'skipped', 'rescheduled')"
        ),
        nullable=False,
    )
    skip_reason: Mapped[Optional[str]] = mapped_column(
        String(50),
        CheckConstraint(
            "skip_reason IN ("
            "'too_tired', 'no_time', 'lost_motivation', 'forgot', "
            "'sick', 'emergency', 'chose_something_else') OR skip_reason IS NULL"
        ),
        nullable=True,
    )

    actual_duration_mins: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True
    )
    quality_rating: Mapped[Optional[int]] = mapped_column(
        Integer,
        CheckConstraint("quality_rating BETWEEN 1 AND 5"),
        nullable=True,
    )

    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    task: Mapped["Task"] = relationship(back_populates="task_logs")
    daily_log: Mapped["DailyLog"] = relationship(back_populates="task_logs")


class DetectedPattern(Base):
    __tablename__ = "detected_patterns"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    goal_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("goals.id", ondelete="SET NULL"),
        nullable=True,
    )

    pattern_type: Mapped[str] = mapped_column(String(50), nullable=False)
    severity: Mapped[str] = mapped_column(
        String(10),
        CheckConstraint("severity IN ('low', 'medium', 'high', 'critical')"),
        nullable=False,
    )

    insight: Mapped[str] = mapped_column(Text, nullable=False)
    fix: Mapped[str] = mapped_column(Text, nullable=False)
    supporting_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    goal: Mapped[Optional["Goal"]] = relationship(back_populates="detected_patterns")


class LLMUsageLog(Base):
    """Track LLM API usage for cost monitoring."""
    __tablename__ = "llm_usage_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    endpoint: Mapped[str] = mapped_column(String(100), nullable=False)
    model_used: Mapped[str] = mapped_column(String(100), nullable=False)
    provider: Mapped[str] = mapped_column(String(30), nullable=False)  # openrouter/groq/ollama
    prompt_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Feedback(Base):
    """User feedback and bug reports."""
    __tablename__ = "feedback"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    feedback_type: Mapped[str] = mapped_column(
        String(20),
        CheckConstraint("feedback_type IN ('bug', 'feature', 'general', 'schedule_quality')"),
        nullable=False,
        default="general",
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    screen_state: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    device_info: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    request_ids: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
