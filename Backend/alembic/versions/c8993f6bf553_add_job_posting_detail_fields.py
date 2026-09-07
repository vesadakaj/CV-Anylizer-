"""add job posting detail fields

Revision ID: c8993f6bf553
Revises: 0d7648a5ece7
Create Date: 2026-09-04 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c8993f6bf553'
down_revision: Union[str, Sequence[str], None] = '0d7648a5ece7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('Jobs', sa.Column('location', sa.String(length=255), nullable=True))
    op.add_column('Jobs', sa.Column('department', sa.String(length=255), nullable=True))
    op.add_column('Jobs', sa.Column('employment_type', sa.String(length=100), nullable=True))
    op.add_column('Jobs', sa.Column('responsibilities', sa.UnicodeText(), nullable=True))
    op.add_column('Jobs', sa.Column('required_qualifications', sa.UnicodeText(), nullable=True))
    op.add_column('Jobs', sa.Column('preferred_qualifications', sa.UnicodeText(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('Jobs', 'preferred_qualifications')
    op.drop_column('Jobs', 'required_qualifications')
    op.drop_column('Jobs', 'responsibilities')
    op.drop_column('Jobs', 'employment_type')
    op.drop_column('Jobs', 'department')
    op.drop_column('Jobs', 'location')
