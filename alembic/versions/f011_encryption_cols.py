"""Sprint 6: Add encryption columns to daily_logs

Migration 011 — Encryption Columns (D15, D36)
Adds evening_note_encrypted (boolean) and evening_note_ciphertext (LargeBinary)
to daily_logs for field-level encryption of evening notes.

Pre-flight: conditionally drops NOT NULL on evening_note (D36) since the
forward migration NULLs it after encryption.

Revision ID: f011_encryption_cols
Revises: e1234567890a
Create Date: 2026-04-28 19:30:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f011_encryption_cols'
down_revision: Union[str, None] = 'e1234567890a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # D36: Pre-flight — ensure evening_note is nullable.
    # Forward migration NULLs the plaintext after encryption;
    # if a NOT NULL constraint exists, it would break.
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'daily_logs'
                  AND column_name = 'evening_note'
                  AND is_nullable = 'NO'
            ) THEN
                ALTER TABLE daily_logs ALTER COLUMN evening_note DROP NOT NULL;
            END IF;
        END $$;
    """)

    # D15: Additive columns — old code safely ignores them.
    op.add_column('daily_logs', sa.Column(
        'evening_note_encrypted', sa.Boolean(),
        server_default=sa.text('false'), nullable=False,
    ))
    op.add_column('daily_logs', sa.Column(
        'evening_note_ciphertext', sa.Text(), nullable=True,
    ))


def downgrade() -> None:
    op.drop_column('daily_logs', 'evening_note_ciphertext')
    op.drop_column('daily_logs', 'evening_note_encrypted')
