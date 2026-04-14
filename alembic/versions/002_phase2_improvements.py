"""Phase 2.1 schema changes

Revision ID: 002_phase2_improvements
Revises: 001_initial_schema
Create Date: 2024-01-01 01:00:00

Changes:
- tasks.priority: constraint updated from 1-5 to 1-3 (3-tier: Core/Normal/Bonus)
- tasks.task_status: new column (active/deferred/parked/completed)
- tasks.schedule_id: made nullable (parked tasks have no schedule)
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "002_phase2_improvements"
down_revision: Union[str, None] = "001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:

    # 1. Drop old priority check constraint
    op.drop_constraint("ck_tasks_priority", "tasks", type_="check")

    # 2. Add new 3-tier priority constraint
    op.create_check_constraint(
        "ck_tasks_priority",
        "tasks",
        "priority BETWEEN 1 AND 3",
    )

    # 3. Add task_status column
    op.add_column(
        "tasks",
        sa.Column(
            "task_status",
            sa.String(20),
            nullable=False,
            server_default="active",
        ),
    )
    op.create_check_constraint(
        "ck_tasks_task_status",
        "tasks",
        "task_status IN ('active', 'deferred', 'parked', 'completed')",
    )

    # 4. Make schedule_id nullable (parked tasks have no schedule)
    op.alter_column(
        "tasks",
        "schedule_id",
        existing_type=sa.dialects.postgresql.UUID(as_uuid=True),
        nullable=True,
    )

    # 5. Drop the CASCADE foreign key and recreate as SET NULL
    # (so deleting a schedule doesn't delete parked tasks)
    op.drop_constraint("tasks_schedule_id_fkey", "tasks", type_="foreignkey")
    op.create_foreign_key(
        "tasks_schedule_id_fkey",
        "tasks", "schedules",
        ["schedule_id"], ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    # Restore CASCADE
    op.drop_constraint("tasks_schedule_id_fkey", "tasks", type_="foreignkey")
    op.create_foreign_key(
        "tasks_schedule_id_fkey",
        "tasks", "schedules",
        ["schedule_id"], ["id"],
        ondelete="CASCADE",
    )

    # Make schedule_id not nullable again
    op.alter_column(
        "tasks",
        "schedule_id",
        existing_type=sa.dialects.postgresql.UUID(as_uuid=True),
        nullable=False,
    )

    # Drop task_status
    op.drop_constraint("ck_tasks_task_status", "tasks", type_="check")
    op.drop_column("tasks", "task_status")

    # Restore old priority constraint
    op.drop_constraint("ck_tasks_priority", "tasks", type_="check")
    op.create_check_constraint(
        "ck_tasks_priority",
        "tasks",
        "priority BETWEEN 1 AND 5",
    )
