"""Drop deprecated is_regenerating and regeneration_started_at columns

These row-level lock flags are replaced by PostgreSQL advisory locks
in the V8 schedule regeneration architecture.

Revision ID: d1234567890a
Revises: c1234567890a
Create Date: 2026-04-19 00:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1234567890a'
down_revision: Union[str, None] = 'c1234567890a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop the row-level lock columns — advisory locks handle concurrency now
    op.drop_column('schedules', 'is_regenerating')
    op.drop_column('schedules', 'regeneration_started_at')

    # Drop the associated index if it exists
    op.execute("""
        DROP INDEX IF EXISTS ix_schedules_lock_claim
    """)


def downgrade() -> None:
    # Restore the columns (for rollback safety)
    op.add_column('schedules', sa.Column(
        'regeneration_started_at',
        sa.DateTime(timezone=True),
        nullable=True,
    ))
    op.add_column('schedules', sa.Column(
        'is_regenerating',
        sa.Boolean(),
        server_default=sa.text('false'),
        nullable=False,
    ))
