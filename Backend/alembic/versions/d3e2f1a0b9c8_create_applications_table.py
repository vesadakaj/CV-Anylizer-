"""create applications table (W2.2)

Revision ID: d3e2f1a0b9c8
Revises: c2d1e0f9a8b7
Create Date: 2026-09-13 21:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd3e2f1a0b9c8'
down_revision: Union[str, Sequence[str], None] = 'c2d1e0f9a8b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'Applications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('candidate_id', sa.Integer(), nullable=False),
        sa.Column('job_id', sa.Integer(), nullable=False),
        sa.Column('cv_id', sa.Integer(), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.ForeignKeyConstraint(['candidate_id'], ['Candidates.id']),
        sa.ForeignKeyConstraint(['job_id'], ['Jobs.id']),
        sa.ForeignKeyConstraint(['cv_id'], ['CVs.id']),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['Users.id']),
        sa.PrimaryKeyConstraint('id'),
        # One Application per Candidate and Job, enforced by the database.
        sa.UniqueConstraint('candidate_id', 'job_id', name='uq_Applications_candidate_job'),
    )
    op.create_index(op.f('ix_Applications_id'), 'Applications', ['id'], unique=False)
    op.create_index('ix_Applications_job_id', 'Applications', ['job_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_Applications_job_id', table_name='Applications')
    op.drop_index(op.f('ix_Applications_id'), table_name='Applications')
    op.drop_table('Applications')
