"""Nullable scheduled times for parked tasks

Revision ID: 004_nullable_scheduled_times
Revises: 003_preferred_model
Create Date: 2024-01-01 03:00:00

Changes:
- tasks.scheduled_start: VARCHAR(5) NOT NULL -> nullable
- tasks.scheduled_end:   VARCHAR(5) NOT NULL -> nullable

Reason: Deferred/parked tasks have no scheduled time.
Using NULL is semantically correct vs the "00:00" magic value.
"""

from typing import Sequence, Union
from alembic import op

revision: str = "004_nullable_scheduled_times"
down_revision: Union[str, None] = "003_preferred_model"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Allow NULL for parked/deferred tasks that have no scheduled time
    op.alter_column("tasks", "scheduled_start", nullable=True)
    op.alter_column("tasks", "scheduled_end",   nullable=True)

    # Fix any existing "00:00" magic values — set them to NULL
    op.execute("""
        UPDATE tasks
        SET scheduled_start = NULL, scheduled_end = NULL
        WHERE task_status IN ('deferred', 'parked')
          AND scheduled_start = '00:00'
    """)


def downgrade() -> None:
    # Restore "00:00" before making NOT NULL again
    op.execute("""
        UPDATE tasks
        SET scheduled_start = '00:00', scheduled_end = '00:00'
        WHERE task_status IN ('deferred', 'parked')
          AND scheduled_start IS NULL
    """)
    op.alter_column("tasks", "scheduled_start", nullable=False)
    op.alter_column("tasks", "scheduled_end",   nullable=False)
