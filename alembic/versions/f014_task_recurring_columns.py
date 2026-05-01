"""Sprint 7: Add recurring task columns to tasks table

Migration 007b — Task Recurring Columns
- recurring_rule_id UUID FK to recurring_task_rules (I41)
- source_date DATE for dedup and milestone queries
- Unique dedup index uq_task_per_rule_per_date (I43/D54)
- Covering index on recurring_rule_id for FK joins

P0#2 Note: The partial index uq_task_per_rule_per_date uses
`deleted_at IS NULL` predicate, which breaks HOT updates when
deleted_at transitions NULL->NOW(). Monthly REINDEX CONCURRENTLY
is required (see app/core/maintenance.py).

Revision ID: f014_task_recurring_columns
Revises: f013_recurring_task_rules
Create Date: 2026-04-30 10:02:00.000000
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f014_task_recurring_columns'
down_revision: Union[str, None] = 'f013_recurring_task_rules'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = ('f013_recurring_task_rules',)


# I41: Column name is recurring_rule_id, NOT source_rule_id

def upgrade() -> None:
    op.execute("""
        ALTER TABLE tasks
          ADD COLUMN IF NOT EXISTS recurring_rule_id UUID
            REFERENCES recurring_task_rules(id) ON DELETE SET NULL
    """)

    op.execute("""
        ALTER TABLE tasks
          ADD COLUMN IF NOT EXISTS source_date DATE
    """)

    # I43/D54: One task per rule per date.
    # P0#2 WARNING: This partial index breaks HOT updates on deleted_at transitions.
    # Schedule monthly REINDEX CONCURRENTLY via cron (see app/core/maintenance.py).
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_task_per_rule_per_date
          ON tasks (recurring_rule_id, source_date)
          WHERE recurring_rule_id IS NOT NULL AND deleted_at IS NULL
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_tasks_recurring_rule_id
          ON tasks (recurring_rule_id)
          WHERE recurring_rule_id IS NOT NULL
    """)


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS ix_tasks_recurring_rule_id')
    op.execute('DROP INDEX IF EXISTS uq_task_per_rule_per_date')
    op.execute('ALTER TABLE tasks DROP COLUMN IF EXISTS source_date')
    op.execute('ALTER TABLE tasks DROP COLUMN IF EXISTS recurring_rule_id')
