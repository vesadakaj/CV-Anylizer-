"""jobs record their creator (W2.4)

Revision ID: f5a4b3c2d1e0
Revises: e4f3a2b1c0d9
Create Date: 2026-09-13 21:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f5a4b3c2d1e0'
down_revision: Union[str, Sequence[str], None] = 'e4f3a2b1c0d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # NOT NULL without a default is fine because the table is empty; batch
    # mode makes SQLite recreate the table and MSSQL run a plain ALTER.
    with op.batch_alter_table('Jobs') as batch_op:
        batch_op.add_column(sa.Column('created_by_user_id', sa.Integer(), nullable=False))
        batch_op.create_foreign_key(
            'fk_Jobs_created_by_user_id_Users', 'Users', ['created_by_user_id'], ['id']
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('Jobs') as batch_op:
        batch_op.drop_constraint('fk_Jobs_created_by_user_id_Users', type_='foreignkey')
        batch_op.drop_column('created_by_user_id')
