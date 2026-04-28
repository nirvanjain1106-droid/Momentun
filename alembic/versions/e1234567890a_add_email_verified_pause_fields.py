"""Add email_verified and pause/sick-mode fields to users

These columns exist in the User model but were never migrated to the DB,
causing 422/500 errors on login and profile queries.

Revision ID: e1234567890a
Revises: d1234567890a
Create Date: 2026-04-26 22:37:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'e1234567890a'
down_revision: Union[str, None] = '1976fec2997a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Email verification columns
    op.add_column('users', sa.Column(
        'email_verified',
        sa.Boolean(),
        server_default=sa.text('false'),
        nullable=False,
    ))
    op.add_column('users', sa.Column(
        'email_verified_at',
        sa.DateTime(timezone=True),
        nullable=True,
    ))

    # Sick-mode / vacation freeze columns
    op.add_column('users', sa.Column(
        'paused_at',
        sa.DateTime(timezone=True),
        nullable=True,
    ))
    op.add_column('users', sa.Column(
        'paused_until',
        sa.DateTime(timezone=True),
        nullable=True,
    ))
    op.add_column('users', sa.Column(
        'paused_reason',
        sa.String(30),
        nullable=True,
    ))


def downgrade() -> None:
    op.drop_column('users', 'paused_reason')
    op.drop_column('users', 'paused_until')
    op.drop_column('users', 'paused_at')
    op.drop_column('users', 'email_verified_at')
    op.drop_column('users', 'email_verified')
