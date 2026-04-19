"""Add generation_version to Schedule

Revision ID: c1234567890a
Revises: b4add9c10268
Create Date: 2026-04-18 19:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1234567890a'
down_revision: Union[str, None] = 'b4add9c10268'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add generation_version column to schedules table
    op.add_column('schedules', sa.Column('generation_version', sa.Integer(), server_default='1', nullable=False))


def downgrade() -> None:
    # Drop generation_version column from schedules table
    op.drop_column('schedules', 'generation_version')
