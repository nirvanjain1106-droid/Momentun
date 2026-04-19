"""empty migration

Revision ID: 003_peak_energy_varchar
Revises: 002_phase2_improvements
Create Date: 2026-04-18 19:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '003_peak_energy_varchar'
down_revision: Union[str, None] = '002_phase2_improvements'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass

def downgrade() -> None:
    pass
