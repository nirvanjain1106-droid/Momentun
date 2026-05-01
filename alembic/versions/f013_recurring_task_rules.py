"""Sprint 7: Create recurring_task_rules table

Migration 007 — Recurring Task Rules
- daily-reset semantics with max_per_day (D55)
- days_of_week uses Python weekday() 0=Mon..6=Sun (I44)
- Tightened scheduled_start regex: ^([01]\\d|2[0-3]):[0-5]\\d$ (P2)
- DB-level days_of_week range CHECK (I47)
- Defense-in-depth trigger for days_of_week uniqueness (P2#6)

Revision ID: f013_recurring_task_rules
Revises: f012_notification_hardening
Create Date: 2026-04-30 10:01:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f013_recurring_task_rules'
down_revision: Union[str, None] = 'f012_notification_hardening'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'recurring_task_rules',
        sa.Column('id', UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('goal_id', UUID(as_uuid=True),
                  sa.ForeignKey('goals.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('task_type', sa.String(30), nullable=False),
        sa.Column('duration_mins', sa.Integer(), nullable=False),
        sa.Column('priority', sa.Integer(), nullable=False, server_default='3'),
        # I44: Python weekday() semantics (0=Mon..6=Sun). NOT ISO 8601 (1-7).
        # Conversion at API boundaries via Pydantic validators (I47).
        sa.Column('days_of_week', ARRAY(sa.Integer()), nullable=False),
        # "HH:MM" or NULL. v2 placeholder: unused in solver v1.
        sa.Column('scheduled_start', sa.String(5), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        # D55: daily intent cap (v1: hardcoded to 1 by unique index)
        sa.Column('max_per_day', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('NOW()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('NOW()'), nullable=False),
        # Task type constraint
        sa.CheckConstraint(
            "task_type IN ('study', 'practice', 'review', 'exercise', "
            "'reading', 'deep_study', 'light_review', 'admin', 'other')",
            name='ck_recurring_task_type',
        ),
        sa.CheckConstraint(
            'priority BETWEEN 1 AND 5',
            name='ck_recurring_priority',
        ),
        # Tightened regex: rejects "25:99" (P2 fix)
        sa.CheckConstraint(
            r"scheduled_start IS NULL OR scheduled_start ~ '^([01]\d|2[0-3]):[0-5]\d$'",
            name='ck_scheduled_start_format',
        ),
        # I47: DB-level defense-in-depth for weekday range
        sa.CheckConstraint(
            'days_of_week <@ ARRAY[0,1,2,3,4,5,6]',
            name='ck_days_of_week_range',
        ),
    )

    # Indexes
    op.create_index('ix_recurring_task_rules_user_id',
                    'recurring_task_rules', ['user_id'])
    op.create_index('ix_recurring_task_rules_goal_id',
                    'recurring_task_rules', ['goal_id'])
    op.create_index('ix_recurring_task_rules_active',
                    'recurring_task_rules', ['user_id', 'is_active'],
                    postgresql_where=sa.text('is_active = TRUE'))

    # P2#6: Defense-in-depth trigger for days_of_week uniqueness.
    # PostgreSQL array containment allows duplicates: [0,0,1] <@ [0..6] is TRUE.
    # Pydantic enforces uniqueness at API layer, but direct DB inserts/ETL bypass it.
    op.execute("""
        CREATE OR REPLACE FUNCTION fn_validate_days_of_week() RETURNS trigger AS $$
        BEGIN
          IF NEW.days_of_week <> (
            SELECT array_agg(DISTINCT x ORDER BY x)
            FROM unnest(NEW.days_of_week) x
          ) THEN
            RAISE EXCEPTION 'days_of_week must contain unique, sorted values 0-6';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        CREATE TRIGGER trg_days_of_week_unique
          BEFORE INSERT OR UPDATE ON recurring_task_rules
          FOR EACH ROW EXECUTE FUNCTION fn_validate_days_of_week();
    """)


def downgrade() -> None:
    op.execute('DROP TRIGGER IF EXISTS trg_days_of_week_unique ON recurring_task_rules')
    op.execute('DROP FUNCTION IF EXISTS fn_validate_days_of_week()')
    op.drop_index('ix_recurring_task_rules_active', table_name='recurring_task_rules')
    op.drop_index('ix_recurring_task_rules_goal_id', table_name='recurring_task_rules')
    op.drop_index('ix_recurring_task_rules_user_id', table_name='recurring_task_rules')
    op.drop_table('recurring_task_rules')
