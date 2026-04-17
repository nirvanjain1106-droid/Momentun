"""Add index idx_dailylog_user_date

Revision ID: b4add9c10268
Revises: bec5767b65a3
Create Date: 2026-04-18 00:45:02.518364

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b4add9c10268'
down_revision: Union[str, None] = 'bec5767b65a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE INDEX IF NOT EXISTS idx_dailylog_user_date ON daily_logs (user_id, date DESC)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_dailylog_user_date")
