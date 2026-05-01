"""Sprint 7: Create notifications table with rescue dedup + reminder indexes

Migration 006 Patch — Notification Hardening
- notifications table with goal_id for per-goal rescue dedup (I37)
- Partial unique index for rescue pending dedup (user_id, goal_id)
- Covering index for reminder_task_id joins
- body_ciphertext uses Text (D58: Fernet base64 strings)
- encryption_key_version for Fernet key rotation (P2#8)

Revision ID: f012_notification_hardening
Revises: f011b_dead_letters
Create Date: 2026-04-30 10:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f012_notification_hardening'
down_revision: Union[str, None] = 'f011b_dead_letters'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'notifications',
        sa.Column('id', UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('goal_id', UUID(as_uuid=True),
                  sa.ForeignKey('goals.id', ondelete='CASCADE'), nullable=True),
        sa.Column('reminder_task_id', UUID(as_uuid=True),
                  sa.ForeignKey('tasks.id', ondelete='SET NULL'), nullable=True),
        sa.Column('type', sa.String(30), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        # D58: body_ciphertext uses Text (not LargeBinary) because Fernet tokens
        # are base64 strings. Fernet.encrypt() returns a URL-safe base64-encoded
        # bytes object that is always decoded to str before storage. Using Text
        # avoids unnecessary encode/decode round-trips.
        sa.Column('body_ciphertext', sa.Text(), nullable=True),
        # P2#8: Fernet key rotation support — tracks which key encrypted this row
        sa.Column('encryption_key_version', sa.Integer(), nullable=True,
                  server_default='0'),
        sa.Column('fire_at_utc', sa.DateTime(timezone=True), nullable=True),
        sa.Column('delivered_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('dismissed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('NOW()'), nullable=False),
        sa.CheckConstraint(
            "type IN ('task_reminder', 'rescue_mission', 'milestone_reached', "
            "'pattern_alert', 'streak_update')",
            name='ck_notification_type',
        ),
    )

    # I37: goal_id index for per-goal queries
    op.create_index(
        'ix_notifications_goal_id',
        'notifications',
        ['goal_id'],
        postgresql_where=sa.text('goal_id IS NOT NULL'),
    )

    # Covering index for reminder_task_id joins
    op.create_index(
        'ix_notification_reminder_task',
        'notifications',
        ['reminder_task_id'],
        postgresql_where=sa.text('reminder_task_id IS NOT NULL'),
    )

    # User-level notification lookup
    op.create_index(
        'ix_notifications_user_id',
        'notifications',
        ['user_id'],
    )

    # Rescue dedup: only one pending rescue per (user, goal)
    op.create_index(
        'uq_notification_rescue_pending',
        'notifications',
        ['user_id', 'goal_id'],
        unique=True,
        postgresql_where=sa.text(
            "type = 'rescue_mission' "
            "AND dismissed_at IS NULL "
            "AND delivered_at IS NULL"
        ),
    )


def downgrade() -> None:
    op.drop_index('uq_notification_rescue_pending', table_name='notifications')
    op.drop_index('ix_notifications_user_id', table_name='notifications')
    op.drop_index('ix_notification_reminder_task', table_name='notifications')
    op.drop_index('ix_notifications_goal_id', table_name='notifications')
    op.drop_table('notifications')
