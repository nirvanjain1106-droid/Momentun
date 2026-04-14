from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional, List

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey,
    Integer, Numeric, String, Text,
    ARRAY, func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.goal import Goal, FixedBlock


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    age: Mapped[Optional[int]] = mapped_column(
        Integer, CheckConstraint("age BETWEEN 13 AND 80"), nullable=True
    )
    gender: Mapped[Optional[str]] = mapped_column(
        String(20),
        CheckConstraint(
            "gender IN ('male', 'female', 'non_binary', 'prefer_not_to_say')"
        ),
        nullable=True,
    )
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    timezone: Mapped[str] = mapped_column(String(50), nullable=False, default="Asia/Kolkata")
    locale: Mapped[str] = mapped_column(String(10), nullable=False, default="en-IN")
    user_type: Mapped[str] = mapped_column(
        String(30),
        CheckConstraint("user_type IN ('student', 'student_intern')"),
        nullable=False,
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    onboarding_complete: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    onboarding_step: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    email_verified_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
    timezone: Mapped[str] = mapped_column(
        String(50), nullable=False, default="Asia/Kolkata", server_default="Asia/Kolkata"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    academic_profile: Mapped[Optional["UserAcademicProfile"]] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    health_profile: Mapped[Optional["UserHealthProfile"]] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    behavioural_profile: Mapped[Optional["UserBehaviouralProfile"]] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    notification_settings: Mapped[Optional["NotificationSettings"]] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    user_settings: Mapped[Optional["UserSettings"]] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    goals: Mapped[List["Goal"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    fixed_blocks: Mapped[List["FixedBlock"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class UserAcademicProfile(Base):
    __tablename__ = "user_academic_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    college_name: Mapped[str] = mapped_column(String(200), nullable=False)
    course_name: Mapped[str] = mapped_column(String(100), nullable=False)
    course_duration: Mapped[int] = mapped_column(Integer, nullable=False)
    current_year: Mapped[int] = mapped_column(Integer, nullable=False)
    current_semester: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cgpa: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 2), nullable=True)
    performance_self_rating: Mapped[Optional[str]] = mapped_column(
        String(20),
        CheckConstraint(
            "performance_self_rating IN ('top_of_class', 'above_average', 'average', 'below_average', 'struggling')"
        ),
        nullable=True,
    )
    college_schedule_type: Mapped[Optional[str]] = mapped_column(
        String(20),
        CheckConstraint("college_schedule_type IN ('fixed', 'rotating', 'irregular')"),
        nullable=True,
    )
    has_weekend_college: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    internship_company: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    internship_days: Mapped[Optional[List[int]]] = mapped_column(ARRAY(Integer), nullable=True)
    internship_hours_per_day: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="academic_profile")


class UserHealthProfile(Base):
    __tablename__ = "user_health_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    has_physical_limitation: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    physical_limitation_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sleep_quality: Mapped[Optional[str]] = mapped_column(
        String(20),
        CheckConstraint("sleep_quality IN ('excellent', 'good', 'poor', 'irregular')"),
        nullable=True,
    )
    average_sleep_hrs: Mapped[Optional[Decimal]] = mapped_column(Numeric(3, 1), nullable=True)
    has_afternoon_crash: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    has_chronic_fatigue: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    has_focus_difficulty: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    focus_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    current_fitness_level: Mapped[Optional[str]] = mapped_column(
        String(20),
        CheckConstraint(
            "current_fitness_level IN ('sedentary', 'lightly_active', 'moderately_active', 'very_active', 'athlete')"
        ),
        nullable=True,
    )
    diet_type: Mapped[Optional[str]] = mapped_column(
        String(30),
        CheckConstraint(
            "diet_type IN ('vegetarian', 'non_vegetarian', 'vegan', 'jain', 'eggetarian', 'no_preference')"
        ),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="health_profile")


class UserBehaviouralProfile(Base):
    __tablename__ = "user_behavioural_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )

    # All time fields stored as VARCHAR(5) "HH:MM" strings
    wake_time: Mapped[str] = mapped_column(String(5), nullable=False)
    sleep_time: Mapped[str] = mapped_column(String(5), nullable=False)

    chronotype: Mapped[str] = mapped_column(
        String(20),
        CheckConstraint("chronotype IN ('early_bird', 'intermediate', 'night_owl')"),
        nullable=False,
    )
    peak_energy_start: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    peak_energy_end: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)

    preferred_study_style: Mapped[Optional[str]] = mapped_column(
        String(20),
        CheckConstraint(
            "preferred_study_style IN ('pomodoro', 'long_blocks', 'short_bursts', 'flexible')"
        ),
        nullable=True,
    )
    max_focus_duration_mins: Mapped[int] = mapped_column(Integer, default=45, nullable=False)
    daily_commitment_hrs: Mapped[Decimal] = mapped_column(
        Numeric(3, 1),
        CheckConstraint("daily_commitment_hrs BETWEEN 0.5 AND 12"),
        nullable=False,
    )
    heavy_days: Mapped[List[int]] = mapped_column(
        ARRAY(Integer), default=list, nullable=False, server_default="{}"
    )
    light_days: Mapped[List[int]] = mapped_column(
        ARRAY(Integer), default=list, nullable=False, server_default="{}"
    )
    primary_distraction: Mapped[Optional[str]] = mapped_column(
        String(30),
        CheckConstraint(
            "primary_distraction IN ('smartphone', 'social_media', 'family_interruptions', 'gaming', 'tv', 'other')"
        ),
        nullable=True,
    )
    self_reported_failure: Mapped[Optional[str]] = mapped_column(
        String(50),
        CheckConstraint(
            "self_reported_failure IN ('start_strong_fade_later', 'never_start', 'inconsistent', 'give_up_after_few_days', 'good_alone_bad_under_stress', 'other')"
        ),
        nullable=True,
    )
    motivation_style: Mapped[Optional[str]] = mapped_column(
        String(20),
        CheckConstraint(
            "motivation_style IN ('deadline_driven', 'streak_driven', 'reward_driven', 'purpose_driven')"
        ),
        nullable=True,
    )
    bad_day_response: Mapped[Optional[str]] = mapped_column(
        String(30),
        CheckConstraint(
            "bad_day_response IN ('bounce_back_next_day', 'need_2_3_days_recovery', 'spiral_for_a_week', 'push_through_regardless')"
        ),
        nullable=True,
    )
    study_environment: Mapped[Optional[str]] = mapped_column(
        String(20),
        CheckConstraint("study_environment IN ('alone', 'with_others', 'library', 'flexible')"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="behavioural_profile")


class NotificationSettings(Base):
    __tablename__ = "notification_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    morning_checkin_time: Mapped[str] = mapped_column(String(5), default="07:05", nullable=False)
    evening_review_time: Mapped[str] = mapped_column(String(5), default="21:30", nullable=False)
    weekly_plan_day: Mapped[int] = mapped_column(Integer, default=7, nullable=False)
    weekly_plan_time: Mapped[str] = mapped_column(String(5), default="19:00", nullable=False)
    task_reminders_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    reminder_mins_before: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    motivational_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    insight_notifications: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    quiet_hours_start: Mapped[str] = mapped_column(String(5), default="22:30", nullable=False)
    quiet_hours_end: Mapped[str] = mapped_column(String(5), default="07:00", nullable=False)
    fcm_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="notification_settings")


class UserSettings(Base):
    __tablename__ = "user_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    theme: Mapped[str] = mapped_column(String(10), default="light", nullable=False)
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)
    week_starts_on: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    # LLM model preference: "primary" = Qwen3.5-27B, "secondary" = Qwen3.5-397B-A17B
    preferred_model: Mapped[str] = mapped_column(
        String(20),
        CheckConstraint("preferred_model IN ('primary', 'secondary')"),
        default="primary",
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="user_settings")
