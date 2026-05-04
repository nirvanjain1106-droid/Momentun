"""merge_peak_energy_branch

Revision ID: 1976fec2997a
Revises: 003_peak_energy_varchar, d1234567890a
Create Date: 2026-04-19 05:44:12.204214

"""
from typing import Sequence, Union



# revision identifiers, used by Alembic.
revision: str = '1976fec2997a'
down_revision: Union[str, tuple[str, str], None] = ('003_peak_energy_varchar', 'd1234567890a')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
