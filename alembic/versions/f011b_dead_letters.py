"""Sprint 6: Create encryption_dead_letters table

Migration 011b — Dead-Letter Table (D21, D23, D26)
Tracks rows that failed encryption/decryption/re-encryption.
Partial unique index prevents duplicates on retry.
Efficient unresolved-entry lookup index.

Revision ID: f011b_dead_letters
Revises: f011_encryption_cols
Create Date: 2026-04-28 19:31:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f011b_dead_letters'
down_revision: Union[str, None] = 'f011_encryption_cols'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # D21, D23, D26: Dead-letter table for encryption operations
    op.create_table(
        'encryption_dead_letters',
        sa.Column('id', UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('source_table', sa.Text(), nullable=False),
        sa.Column('source_row_id', UUID(as_uuid=True), nullable=False),
        sa.Column('operation', sa.Text(), nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('NOW()'), nullable=False),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_retry_at', sa.DateTime(timezone=True), nullable=True),
    )

    # D23: Partial unique — prevents duplicates on retry
    op.create_index(
        'uq_dead_letter_active',
        'encryption_dead_letters',
        ['source_table', 'source_row_id', 'operation'],
        unique=True,
        postgresql_where=sa.text('resolved_at IS NULL'),
    )

    # Efficient lookup for unresolved entries
    op.create_index(
        'ix_dead_letters_unresolved',
        'encryption_dead_letters',
        ['source_table', 'created_at'],
        postgresql_where=sa.text('resolved_at IS NULL'),
    )


def downgrade() -> None:
    op.drop_index('ix_dead_letters_unresolved', table_name='encryption_dead_letters')
    op.drop_index('uq_dead_letter_active', table_name='encryption_dead_letters')
    op.drop_table('encryption_dead_letters')
