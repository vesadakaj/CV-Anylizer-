"""match results keyed by application (W2.3)

MatchResults becomes 1:1 with Applications and records the scoring
algorithm version so stale rows can be recomputed on read. The table is
empty, so it is dropped and recreated instead of migrated in place.

Revision ID: e4f3a2b1c0d9
Revises: d3e2f1a0b9c8
Create Date: 2026-09-13 21:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e4f3a2b1c0d9'
down_revision: Union[str, Sequence[str], None] = 'd3e2f1a0b9c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_index(op.f('ix_MatchResults_id'), table_name='MatchResults')
    op.drop_table('MatchResults')

    op.create_table(
        'MatchResults',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('application_id', sa.Integer(), nullable=False),
        sa.Column('overall_score', sa.Float(), nullable=False),
        sa.Column('skill_score', sa.Float(), nullable=True),
        sa.Column('experience_score', sa.Float(), nullable=True),
        sa.Column('education_score', sa.Float(), nullable=True),
        sa.Column('language_score', sa.Float(), nullable=True),
        sa.Column('explanation', sa.UnicodeText(), nullable=True),
        sa.Column('algorithm_version', sa.Integer(), nullable=False),
        sa.Column('scored_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.ForeignKeyConstraint(['application_id'], ['Applications.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('application_id', name='uq_MatchResults_application_id'),
    )
    op.create_index(op.f('ix_MatchResults_id'), 'MatchResults', ['id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_MatchResults_id'), table_name='MatchResults')
    op.drop_table('MatchResults')

    op.create_table(
        'MatchResults',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('candidate_id', sa.Integer(), nullable=False),
        sa.Column('job_id', sa.Integer(), nullable=False),
        sa.Column('overall_score', sa.Float(), nullable=False),
        sa.Column('skill_score', sa.Float(), nullable=True),
        sa.Column('experience_score', sa.Float(), nullable=True),
        sa.Column('education_score', sa.Float(), nullable=True),
        sa.Column('language_score', sa.Float(), nullable=True),
        sa.Column('explanation', sa.UnicodeText(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.ForeignKeyConstraint(['candidate_id'], ['Candidates.id']),
        sa.ForeignKeyConstraint(['job_id'], ['Jobs.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_MatchResults_id'), 'MatchResults', ['id'], unique=False)
