"""Sprint 7: Patch existing notifications table with goal_id + indexes

Migration 006 Patch — Notification Hardening
- Add goal_id FK column to existing notifications table (I37)
- Partial index for goal_id lookups
- Partial index for reminder_task_id joins (P1 fix — missing FK index)
- Unique partial index for rescue dedup on (user_id, goal_id)

Revision ID: f012_notification_hardening
Revises: f011b_dead_letters
Create Date: 2026-04-30 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f012_notification_hardening'
down_revision: Union[str, None] = 'f011b_dead_letters'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = ('f011b_dead_letters',)


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            reminder_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
            type VARCHAR(30) NOT NULL,
            title VARCHAR(200) NOT NULL,
            body_ciphertext TEXT,
            encryption_key_version INTEGER DEFAULT 0,
            fire_at_utc TIMESTAMP WITH TIME ZONE,
            delivered_at TIMESTAMP WITH TIME ZONE,
            dismissed_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            CONSTRAINT ck_notification_type CHECK (
                type IN ('task_reminder', 'rescue_mission', 'milestone_reached',
                         'pattern_alert', 'streak_update')
            )
        )
    """)

    op.execute("""
        ALTER TABLE notifications
          ADD COLUMN IF NOT EXISTS goal_id UUID
          REFERENCES goals(id) ON DELETE CASCADE
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_notifications_goal_id
          ON notifications (goal_id)
          WHERE goal_id IS NOT NULL
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_notification_reminder_task
          ON notifications (reminder_task_id)
          WHERE reminder_task_id IS NOT NULL
    """)

    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_rescue_pending
          ON notifications (user_id, goal_id)
          WHERE type = 'rescue_mission'
            AND dismissed_at IS NULL
            AND delivered_at IS NULL
    """)


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS uq_notification_rescue_pending')
    op.execute('DROP INDEX IF EXISTS ix_notification_reminder_task')
    op.execute('DROP INDEX IF EXISTS ix_notifications_goal_id')
    op.execute('ALTER TABLE notifications DROP COLUMN IF EXISTS goal_id')
