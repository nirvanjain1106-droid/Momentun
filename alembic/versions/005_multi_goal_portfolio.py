"""005 — Multi-goal portfolio architecture

Revision ID: 005_multi_goal_portfolio
Revises: 004_nullable_scheduled_times
Create Date: 2026-04-16

Changes:
- Goal: add priority_rank, pre_pause_rank columns
- Task: add goal_rank_snapshot column, add 'expired' to task_status CHECK
- Schedule: add is_stale, is_regenerating, regeneration_started_at columns
- Schedule: drop goal_id FK column (portfolio-scoped ownership)
- WeeklyPlan: drop goal_id FK column (portfolio-level narrative)
- Goal: add partial unique index for (user_id, priority_rank) on active goals
- Goal: add CHECK constraint — active goals must have non-NULL priority_rank
- Goal: drop old single-active-goal unique index
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "005_multi_goal_portfolio"
down_revision: Union[str, None] = "004_nullable_scheduled_times"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:

    # ── Step 0: Pre-migration data audit ──────────────────────
    # If dirty data exists (multiple active goals per user from a bug window),
    # the unique index in Step 4 will fail. Halt if any duplicates found.
    conn = op.get_bind()
    result = conn.execute(sa.text("""
        SELECT user_id, COUNT(*) as cnt
        FROM goals
        WHERE status = 'active' AND deleted_at IS NULL
        GROUP BY user_id
        HAVING COUNT(*) > 1
    """))
    duplicates = result.fetchall()
    if duplicates:
        user_ids = [str(row[0]) for row in duplicates]
        raise RuntimeError(
            f"Migration blocked: {len(duplicates)} user(s) have multiple active goals. "
            f"Fix these before running migration: {user_ids}"
        )

    # ── Step 1: Add new columns ───────────────────────────────
    op.add_column("goals", sa.Column("priority_rank", sa.Integer(), nullable=True))
    op.add_column("goals", sa.Column("pre_pause_rank", sa.Integer(), nullable=True))
    op.add_column("tasks", sa.Column("goal_rank_snapshot", sa.Integer(), nullable=True))
    op.add_column("schedules", sa.Column(
        "is_stale", sa.Boolean(), server_default="false", nullable=False
    ))
    op.add_column("schedules", sa.Column(
        "is_regenerating", sa.Boolean(), server_default="false", nullable=False
    ))
    op.add_column("schedules", sa.Column(
        "regeneration_started_at", sa.DateTime(timezone=True), nullable=True
    ))

    # ── Step 2: Backfill existing active goals with rank=1 ────
    # Safe: Step 0 verified at most 1 active goal per user
    op.execute("""
        UPDATE goals SET priority_rank = 1
        WHERE status = 'active' AND deleted_at IS NULL
    """)

    # ── Step 3: Update task_status CHECK constraint ───────────
    # task_status uses a CHECK constraint, NOT a Postgres enum type
    op.drop_constraint("ck_tasks_task_status", "tasks", type_="check")
    op.create_check_constraint(
        "ck_tasks_task_status",
        "tasks",
        "task_status IN ('active', 'deferred', 'parked', 'completed', 'expired')",
    )

    # ── Step 4: Create partial unique index for rank ──────────
    op.execute("""
        CREATE UNIQUE INDEX uq_goal_rank_per_user
        ON goals (user_id, priority_rank)
        WHERE status = 'active' AND deleted_at IS NULL
    """)

    # ── Step 5: CHECK constraint — bidirectional rank invariant ──
    # Active goals MUST have a rank, inactive goals MUST NOT have a rank.
    # This prevents stale rank data from surviving status transitions
    # via direct SQL, admin tools, or future endpoints.
    op.create_check_constraint(
        "ck_active_goal_has_rank",
        "goals",
        "(status = 'active' AND priority_rank IS NOT NULL) OR "
        "(status != 'active' AND priority_rank IS NULL)",
    )

    # ── Step 6: Drop old single-active-goal index ─────────────
    op.execute("DROP INDEX IF EXISTS uq_one_active_goal_per_user")

    # ── Step 7: Drop goal_id from schedules and weekly_plans ──
    op.drop_constraint("schedules_goal_id_fkey", "schedules", type_="foreignkey")
    op.drop_column("schedules", "goal_id")

    op.drop_constraint("weekly_plans_goal_id_fkey", "weekly_plans", type_="foreignkey")
    op.drop_column("weekly_plans", "goal_id")


def downgrade() -> None:
    """
    Reverse migration. Note: goal_id data is LOST (re-added as nullable).
    expired tasks are mapped back to deferred.
    """
    # Re-add goal_id columns (nullable — data is lost)
    op.add_column("weekly_plans", sa.Column(
        "goal_id", postgresql.UUID(as_uuid=True), nullable=True
    ))
    op.create_foreign_key(
        "weekly_plans_goal_id_fkey", "weekly_plans", "goals",
        ["goal_id"], ["id"], ondelete="SET NULL",
    )

    op.add_column("schedules", sa.Column(
        "goal_id", postgresql.UUID(as_uuid=True), nullable=True
    ))
    op.create_foreign_key(
        "schedules_goal_id_fkey", "schedules", "goals",
        ["goal_id"], ["id"], ondelete="SET NULL",
    )

    # Collapse multi-goal state to single-active-goal per user.
    # Keep only the lowest-ranked (best) active goal; pause the rest.
    # Required because the old unique index allows at most 1 active goal per user.
    conn = op.get_bind()
    conn.execute(sa.text("""
        UPDATE goals
        SET status = 'paused', priority_rank = NULL
        WHERE id IN (
            SELECT id FROM (
                SELECT id,
                       ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY priority_rank ASC NULLS LAST) AS rn
                FROM goals
                WHERE status = 'active' AND deleted_at IS NULL
            ) ranked
            WHERE rn > 1
        )
    """))

    # Re-create old unique index (single active goal per user)
    op.execute("""
        CREATE UNIQUE INDEX uq_one_active_goal_per_user
        ON goals (user_id)
        WHERE status = 'active' AND deleted_at IS NULL
    """)

    # Drop new index and constraints
    op.execute("DROP INDEX IF EXISTS uq_goal_rank_per_user")
    op.drop_constraint("ck_active_goal_has_rank", "goals", type_="check")

    # Map expired tasks back to deferred
    op.execute("UPDATE tasks SET task_status = 'deferred' WHERE task_status = 'expired'")

    # Restore old task_status CHECK constraint
    op.drop_constraint("ck_tasks_task_status", "tasks", type_="check")
    op.create_check_constraint(
        "ck_tasks_task_status",
        "tasks",
        "task_status IN ('active', 'deferred', 'parked', 'completed')",
    )

    # Drop new columns
    op.drop_column("schedules", "regeneration_started_at")
    op.drop_column("schedules", "is_regenerating")
    op.drop_column("schedules", "is_stale")
    op.drop_column("tasks", "goal_rank_snapshot")
    op.drop_column("goals", "pre_pause_rank")
    op.drop_column("goals", "priority_rank")
