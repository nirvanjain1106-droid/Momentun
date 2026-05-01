"""Sprint 7: Create recurring_task_rules table

Migration 007 — Recurring Task Rules
- daily-reset semantics with max_per_day (D55)
- days_of_week uses Python weekday() 0=Mon..6=Sun (I44). NOT ISO 8601 (1-7).
- DB-level days_of_week range CHECK (I47)
- Tightened scheduled_start regex: ^([01]\\d|2[0-3]):[0-5]\\d$ (P2)

Revision ID: f013_recurring_task_rules
Revises: f012_notification_hardening
Create Date: 2026-04-30 10:01:00.000000
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f013_recurring_task_rules'
down_revision: Union[str, None] = 'f012_notification_hardening'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = ('f012_notification_hardening',)


# I44: days_of_week uses Python weekday() semantics: 0=Mon..6=Sun.
# NOT ISO 8601 (1-7). Conversion at API boundaries via Pydantic validators.

# D55 NOTE: max_per_day stores the product intent (daily cap per rule).
# In v1, the unique index uq_task_per_rule_per_date hard-limits this to 1.
# Supporting max_per_day > 1 requires dropping the unique index and implementing
# atomic counter reservation (Option B from Q1 resolution). Accepted v1 trade-off.

def upgrade() -> None:
    op.execute("""
        CREATE TABLE recurring_task_rules (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            goal_id          UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
            title            VARCHAR(200) NOT NULL,
            task_type        VARCHAR(30) NOT NULL,
            duration_mins    INTEGER NOT NULL,
            priority         INTEGER NOT NULL DEFAULT 3,
            days_of_week     INTEGER[] NOT NULL,
            scheduled_start  VARCHAR(5),
            is_active        BOOLEAN NOT NULL DEFAULT TRUE,
            max_per_day      INTEGER NOT NULL DEFAULT 1,
            created_at       TIMESTAMPTZ DEFAULT NOW(),
            updated_at       TIMESTAMPTZ DEFAULT NOW(),

            CONSTRAINT ck_recurring_task_type CHECK (
                task_type IN ('study', 'practice', 'review', 'exercise', 'reading', 'other')
            ),
            CONSTRAINT ck_recurring_priority CHECK (priority BETWEEN 1 AND 5),
            CONSTRAINT ck_scheduled_start_format CHECK (
                scheduled_start IS NULL
                OR scheduled_start ~ '^([01]\\d|2[0-3]):[0-5]\\d$'
            ),
            CONSTRAINT ck_days_of_week_range CHECK (
                days_of_week <@ ARRAY[0,1,2,3,4,5,6]
            )
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_recurring_task_rules_user_id
          ON recurring_task_rules (user_id)
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_recurring_task_rules_goal_id
          ON recurring_task_rules (goal_id)
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_recurring_task_rules_active
          ON recurring_task_rules (user_id, is_active)
          WHERE is_active = TRUE
    """)


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS ix_recurring_task_rules_active')
    op.execute('DROP INDEX IF EXISTS ix_recurring_task_rules_goal_id')
    op.execute('DROP INDEX IF EXISTS ix_recurring_task_rules_user_id')
    op.execute('DROP TABLE IF EXISTS recurring_task_rules')
