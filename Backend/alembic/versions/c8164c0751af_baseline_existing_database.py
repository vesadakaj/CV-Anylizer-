"""baseline existing database

Revision ID: c8164c0751af
Revises: 534e8a9bcecb
Create Date: 2026-08-27 12:50:41.294091

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c8164c0751af'
down_revision: Union[str, Sequence[str], None] = '534e8a9bcecb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
