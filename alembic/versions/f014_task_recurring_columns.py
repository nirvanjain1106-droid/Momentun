"""Sprint 7: Add recurring task columns to tasks table

Migration 007b — Task Recurring Columns
- recurring_rule_id UUID FK to recurring_task_rules (I41)
- source_date DATE for dedup and milestone queries
- Unique dedup index uq_task_per_rule_per_date (I43/D54)
- Covering index on recurring_rule_id for FK joins

P0#2 Note: The partial index uq_task_per_rule_per_date uses
`deleted_at IS NULL` predicate, which breaks HOT updates when
deleted_at transitions NULL→NOW(). Monthly REINDEX CONCURRENTLY
is required (see app/core/maintenance.py).

Revision ID: f014_task_recurring_columns
Revises: f013_recurring_task_rules
Create Date: 2026-04-30 10:02:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f014_task_recurring_columns'
down_revision: Union[str, None] = 'f013_recurring_task_rules'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # I41: Column is recurring_rule_id, NOT source_rule_id
    op.add_column('tasks', sa.Column(
        'recurring_rule_id', UUID(as_uuid=True),
        sa.ForeignKey('recurring_task_rules.id', ondelete='SET NULL'),
        nullable=True,
    ))
    op.add_column('tasks', sa.Column(
        'source_date', sa.Date(), nullable=True,
    ))

    # I43/D54: Index-only dedup. One task per rule per date.
    # P0#2 WARNING: This partial index breaks HOT updates on deleted_at transitions.
    # Schedule monthly REINDEX CONCURRENTLY via cron (see app/core/maintenance.py).
    op.create_index(
        'uq_task_per_rule_per_date',
        'tasks',
        ['recurring_rule_id', 'source_date'],
        unique=True,
        postgresql_where=sa.text(
            'recurring_rule_id IS NOT NULL AND deleted_at IS NULL'
        ),
    )

    # Covering index for FK joins on recurring_rule_id
    op.create_index(
        'ix_tasks_recurring_rule_id',
        'tasks',
        ['recurring_rule_id'],
        postgresql_where=sa.text('recurring_rule_id IS NOT NULL'),
    )


def downgrade() -> None:
    op.drop_index('ix_tasks_recurring_rule_id', table_name='tasks')
    op.drop_index('uq_task_per_rule_per_date', table_name='tasks')
    op.drop_column('tasks', 'source_date')
    op.drop_column('tasks', 'recurring_rule_id')
