"""Add preferred_model to user_settings

Revision ID: 003_preferred_model
Revises: 002_phase2_improvements
Create Date: 2024-01-01 02:00:00

Changes:
- user_settings.preferred_model: new column ("primary" | "secondary")
  Controls which Qwen3.5 model the user gets (27B vs 397B-A17B)
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "003_preferred_model"
down_revision: Union[str, None] = "002_phase2_improvements"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_settings",
        sa.Column(
            "preferred_model",
            sa.String(20),
            nullable=False,
            server_default="primary",
        ),
    )
    op.create_check_constraint(
        "ck_user_settings_preferred_model",
        "user_settings",
        "preferred_model IN ('primary', 'secondary')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_user_settings_preferred_model",
        "user_settings",
        type_="check",
    )
    op.drop_column("user_settings", "preferred_model")
