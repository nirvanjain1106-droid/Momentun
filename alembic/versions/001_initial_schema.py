"""Initial schema — all tables

Revision ID: 001_initial_schema
Revises: 
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:

    # ── users ──────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("age", sa.Integer(), nullable=True),
        sa.Column("gender", sa.String(20), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("state", sa.String(100), nullable=True),
        sa.Column("timezone", sa.String(50), nullable=False, server_default="Asia/Kolkata"),
        sa.Column("locale", sa.String(10), nullable=False, server_default="en-IN"),
        sa.Column("user_type", sa.String(30), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(15), nullable=True),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("onboarding_complete", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("onboarding_step", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("age BETWEEN 13 AND 80", name="ck_users_age"),
        sa.CheckConstraint(
            "gender IN ('male', 'female', 'non_binary', 'prefer_not_to_say')",
            name="ck_users_gender",
        ),
        sa.CheckConstraint(
            "user_type IN ('student', 'student_intern')",
            name="ck_users_user_type",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # ── user_academic_profiles ─────────────────────────────────────────────
    op.create_table(
        "user_academic_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("college_name", sa.String(200), nullable=False),
        sa.Column("course_name", sa.String(100), nullable=False),
        sa.Column("course_duration", sa.Integer(), nullable=False),
        sa.Column("current_year", sa.Integer(), nullable=False),
        sa.Column("current_semester", sa.Integer(), nullable=True),
        sa.Column("cgpa", sa.Numeric(4, 2), nullable=True),
        sa.Column("performance_self_rating", sa.String(20), nullable=True),
        sa.Column("college_schedule_type", sa.String(20), nullable=True),
        sa.Column("has_weekend_college", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("internship_company", sa.String(200), nullable=True),
        sa.Column("internship_days", postgresql.ARRAY(sa.Integer()), nullable=True),
        sa.Column("internship_hours_per_day", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "performance_self_rating IN ('top_of_class', 'above_average', 'average', 'below_average', 'struggling')",
            name="ck_academic_performance_rating",
        ),
        sa.CheckConstraint(
            "college_schedule_type IN ('fixed', 'rotating', 'irregular')",
            name="ck_academic_schedule_type",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )

    # ── user_health_profiles ───────────────────────────────────────────────
    op.create_table(
        "user_health_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("has_physical_limitation", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("physical_limitation_note", sa.Text(), nullable=True),
        sa.Column("sleep_quality", sa.String(20), nullable=True),
        sa.Column("average_sleep_hrs", sa.Numeric(3, 1), nullable=True),
        sa.Column("has_afternoon_crash", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("has_chronic_fatigue", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("has_focus_difficulty", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("focus_note", sa.Text(), nullable=True),
        sa.Column("current_fitness_level", sa.String(20), nullable=True),
        sa.Column("diet_type", sa.String(30), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "sleep_quality IN ('excellent', 'good', 'poor', 'irregular')",
            name="ck_health_sleep_quality",
        ),
        sa.CheckConstraint(
            "current_fitness_level IN ('sedentary', 'lightly_active', 'moderately_active', 'very_active', 'athlete')",
            name="ck_health_fitness_level",
        ),
        sa.CheckConstraint(
            "diet_type IN ('vegetarian', 'non_vegetarian', 'vegan', 'jain', 'eggetarian', 'no_preference')",
            name="ck_health_diet_type",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )

    # ── user_behavioural_profiles ──────────────────────────────────────────
    op.create_table(
        "user_behavioural_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("wake_time", sa.String(5), nullable=False),
        sa.Column("sleep_time", sa.String(5), nullable=False),
        sa.Column("chronotype", sa.String(20), nullable=False),
        sa.Column("peak_energy_start", sa.String(5), nullable=True),
        sa.Column("peak_energy_end", sa.String(5), nullable=True),
        sa.Column("preferred_study_style", sa.String(20), nullable=True),
        sa.Column("max_focus_duration_mins", sa.Integer(), nullable=False, server_default="45"),
        sa.Column("daily_commitment_hrs", sa.Numeric(3, 1), nullable=False),
        sa.Column("heavy_days", postgresql.ARRAY(sa.Integer()), nullable=False, server_default="{}"),
        sa.Column("light_days", postgresql.ARRAY(sa.Integer()), nullable=False, server_default="{}"),
        sa.Column("primary_distraction", sa.String(30), nullable=True),
        sa.Column("self_reported_failure", sa.String(50), nullable=True),
        sa.Column("motivation_style", sa.String(20), nullable=True),
        sa.Column("bad_day_response", sa.String(30), nullable=True),
        sa.Column("study_environment", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "chronotype IN ('early_bird', 'intermediate', 'night_owl')",
            name="ck_behavioural_chronotype",
        ),
        sa.CheckConstraint(
            "daily_commitment_hrs BETWEEN 0.5 AND 12",
            name="ck_behavioural_commitment_hrs",
        ),
        sa.CheckConstraint(
            "preferred_study_style IN ('pomodoro', 'long_blocks', 'short_bursts', 'flexible')",
            name="ck_behavioural_study_style",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )

    # ── notification_settings ──────────────────────────────────────────────
    op.create_table(
        "notification_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("morning_checkin_time", sa.String(5), nullable=False, server_default="07:05"),
        sa.Column("evening_review_time", sa.String(5), nullable=False, server_default="21:30"),
        sa.Column("weekly_plan_day", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("weekly_plan_time", sa.String(5), nullable=False, server_default="19:00"),
        sa.Column("task_reminders_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("reminder_mins_before", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("motivational_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("insight_notifications", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("quiet_hours_start", sa.String(5), nullable=False, server_default="22:30"),
        sa.Column("quiet_hours_end", sa.String(5), nullable=False, server_default="07:00"),
        sa.Column("fcm_token", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )

    # ── user_settings ──────────────────────────────────────────────────────
    op.create_table(
        "user_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("theme", sa.String(10), nullable=False, server_default="light"),
        sa.Column("language", sa.String(10), nullable=False, server_default="en"),
        sa.Column("week_starts_on", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )

    # ── goals ──────────────────────────────────────────────────────────────
    op.create_table(
        "goals",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("goal_type", sa.String(30), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("target_date", sa.Date(), nullable=False),
        sa.Column("motivation", sa.Text(), nullable=True),
        sa.Column("consequence", sa.Text(), nullable=True),
        sa.Column("success_metric", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("metadata", postgresql.JSONB(), nullable=True, server_default="{}"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "goal_type IN ('exam', 'fitness', 'skill', 'project', 'habit', 'other')",
            name="ck_goals_goal_type",
        ),
        sa.CheckConstraint(
            "status IN ('active', 'achieved', 'abandoned', 'paused')",
            name="ck_goals_status",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_goals_user_id", "goals", ["user_id"])

    # One active goal per user — partial unique index (excludes soft deleted)
    op.execute(
        """
        CREATE UNIQUE INDEX uq_one_active_goal_per_user
        ON goals (user_id)
        WHERE status = 'active' AND deleted_at IS NULL
        """
    )

    # ── fixed_blocks ───────────────────────────────────────────────────────
    op.create_table(
        "fixed_blocks",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(100), nullable=False),
        sa.Column("block_type", sa.String(30), nullable=False),
        sa.Column("applies_to_days", postgresql.ARRAY(sa.Integer()), nullable=False),
        sa.Column("start_time", sa.String(5), nullable=False),
        sa.Column("end_time", sa.String(5), nullable=False),
        sa.Column("is_hard_constraint", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("buffer_before", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("buffer_after", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("valid_from", sa.Date(), nullable=True),
        sa.Column("valid_until", sa.Date(), nullable=True),
        sa.Column("is_seasonal", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("season_label", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "block_type IN ('sleep', 'meal', 'college', 'travel', 'hygiene', 'prayer', 'family', 'commute', 'other')",
            name="ck_fixed_blocks_block_type",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_fixed_blocks_user_id", "fixed_blocks", ["user_id"])

    # ── weekly_plans ───────────────────────────────────────────────────────
    op.create_table(
        "weekly_plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("goal_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("week_start_date", sa.Date(), nullable=False),
        sa.Column("week_end_date", sa.Date(), nullable=False),
        sa.Column("week_theme", sa.String(100), nullable=True),
        sa.Column("strategy_note", sa.Text(), nullable=True),
        sa.Column("overall_completion_at_generation", sa.Float(), nullable=True),
        sa.Column("days_remaining_at_generation", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="upcoming"),
        sa.Column("generated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('upcoming', 'active', 'completed', 'abandoned')",
            name="ck_weekly_plans_status",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["goal_id"], ["goals.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_weekly_plans_user_id", "weekly_plans", ["user_id"])

    # ── schedules ──────────────────────────────────────────────────────────
    op.create_table(
        "schedules",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("goal_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("weekly_plan_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("schedule_date", sa.Date(), nullable=False),
        sa.Column("day_type", sa.String(30), nullable=False, server_default="standard"),
        sa.Column("day_type_reason", sa.Text(), nullable=True),
        sa.Column("strategy_note", sa.Text(), nullable=True),
        sa.Column("generated_by", sa.String(20), nullable=False, server_default="ai"),
        sa.Column("model_used", sa.String(50), nullable=True),
        sa.Column("generation_prompt", sa.Text(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "day_type IN ('standard', 'stretch', 'minimum_viable', 'recovery', 'compressed')",
            name="ck_schedules_day_type",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["goal_id"], ["goals.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["weekly_plan_id"], ["weekly_plans.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_schedules_user_id", "schedules", ["user_id"])
    op.create_index("ix_schedules_schedule_date", "schedules", ["schedule_date"])

    # One schedule per user per date (excluding soft deleted)
    op.execute(
        """
        CREATE UNIQUE INDEX uq_one_schedule_per_user_per_date
        ON schedules (user_id, schedule_date)
        WHERE deleted_at IS NULL
        """
    )

    # ── tasks ──────────────────────────────────────────────────────────────
    op.create_table(
        "tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("schedule_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("goal_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("task_type", sa.String(30), nullable=False),
        sa.Column("scheduled_start", sa.String(5), nullable=False),
        sa.Column("scheduled_end", sa.String(5), nullable=False),
        sa.Column("duration_mins", sa.Integer(), nullable=False),
        sa.Column("energy_required", sa.String(10), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("is_mvp_task", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("sequence_order", sa.Integer(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "task_type IN ('deep_study', 'light_review', 'exercise', 'practice', 'revision', 'break', 'admin', 'other')",
            name="ck_tasks_task_type",
        ),
        sa.CheckConstraint(
            "energy_required IN ('high', 'medium', 'low')",
            name="ck_tasks_energy_required",
        ),
        sa.CheckConstraint("priority BETWEEN 1 AND 5", name="ck_tasks_priority"),
        sa.ForeignKeyConstraint(["schedule_id"], ["schedules.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["goal_id"], ["goals.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tasks_schedule_id", "tasks", ["schedule_id"])

    # ── daily_logs ─────────────────────────────────────────────────────────
    op.create_table(
        "daily_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("schedule_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("log_date", sa.Date(), nullable=False),
        sa.Column("morning_energy", sa.String(10), nullable=True),
        sa.Column("yesterday_rating", sa.String(20), nullable=True),
        sa.Column("surprise_event", sa.String(50), nullable=True),
        sa.Column("surprise_note", sa.Text(), nullable=True),
        sa.Column("tasks_scheduled", sa.Integer(), nullable=True),
        sa.Column("tasks_completed", sa.Integer(), nullable=True),
        sa.Column("completion_rate", sa.Float(), nullable=True),
        sa.Column("mood_score", sa.Integer(), nullable=True),
        sa.Column("evening_note", sa.Text(), nullable=True),
        sa.Column("actual_day_type", sa.String(30), nullable=True),
        sa.Column("morning_checkin_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("evening_review_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "morning_energy IN ('high', 'medium', 'low', 'exhausted')",
            name="ck_daily_logs_morning_energy",
        ),
        sa.CheckConstraint(
            "yesterday_rating IN ('crushed_it', 'decent', 'rough', 'barely_survived')",
            name="ck_daily_logs_yesterday_rating",
        ),
        sa.CheckConstraint(
            "surprise_event IN ('none', 'family_event', 'sick', 'college_extra', 'power_cut', 'travel', 'other')",
            name="ck_daily_logs_surprise_event",
        ),
        sa.CheckConstraint("mood_score BETWEEN 1 AND 5", name="ck_daily_logs_mood_score"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["schedule_id"], ["schedules.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_daily_logs_user_id", "daily_logs", ["user_id"])
    op.create_index("ix_daily_logs_log_date", "daily_logs", ["log_date"])

    # One daily log per user per date
    op.execute(
        """
        CREATE UNIQUE INDEX uq_one_daily_log_per_user_per_date
        ON daily_logs (user_id, log_date)
        """
    )

    # ── task_logs ──────────────────────────────────────────────────────────
    op.create_table(
        "task_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("daily_log_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("skip_reason", sa.String(50), nullable=True),
        sa.Column("actual_duration_mins", sa.Integer(), nullable=True),
        sa.Column("quality_rating", sa.Integer(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "status IN ('completed', 'partial', 'skipped', 'rescheduled')",
            name="ck_task_logs_status",
        ),
        sa.CheckConstraint(
            "skip_reason IN ('too_tired', 'no_time', 'lost_motivation', 'forgot', 'sick', 'emergency', 'chose_something_else') OR skip_reason IS NULL",
            name="ck_task_logs_skip_reason",
        ),
        sa.CheckConstraint(
            "quality_rating BETWEEN 1 AND 5",
            name="ck_task_logs_quality_rating",
        ),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["daily_log_id"], ["daily_logs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_task_logs_task_id", "task_logs", ["task_id"])

    # ── detected_patterns ──────────────────────────────────────────────────
    op.create_table(
        "detected_patterns",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("goal_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("pattern_type", sa.String(50), nullable=False),
        sa.Column("severity", sa.String(10), nullable=False),
        sa.Column("insight", sa.Text(), nullable=False),
        sa.Column("fix", sa.Text(), nullable=False),
        sa.Column("supporting_data", postgresql.JSONB(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("detected_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "severity IN ('low', 'medium', 'high', 'critical')",
            name="ck_detected_patterns_severity",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["goal_id"], ["goals.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_detected_patterns_user_id", "detected_patterns", ["user_id"])


def downgrade() -> None:
    """Drop all tables in reverse order (respects foreign keys)."""
    op.drop_table("detected_patterns")
    op.drop_table("task_logs")
    op.drop_table("daily_logs")
    op.drop_table("tasks")
    op.drop_table("schedules")
    op.drop_table("weekly_plans")
    op.drop_table("fixed_blocks")
    op.drop_table("goals")
    op.drop_table("user_settings")
    op.drop_table("notification_settings")
    op.drop_table("user_behavioural_profiles")
    op.drop_table("user_health_profiles")
    op.drop_table("user_academic_profiles")
    op.drop_table("users")
