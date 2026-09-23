"""add posting_date and make jobs description nullable

Revision ID: 0d7648a5ece7
Revises: 0047b0c1c4d7
Create Date: 2026-09-04 10:00:37.927279

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0d7648a5ece7'
down_revision: Union[str, Sequence[str], None] = '0047b0c1c4d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _description_type() -> sa.types.TypeEngine:
    """The existing `Jobs.description` type, as each backend sees it.

    MSSQL keeps the collation so the column is reflected unchanged. SQLite
    rebuilds the table from this type in batch mode and rejects a SQL Server
    collation name, so it gets the plain Unicode text type the model declares.
    """
    if op.get_bind().dialect.name == 'mssql':
        return sa.NVARCHAR(collation='SQL_Latin1_General_CP1_CI_AS')
    return sa.UnicodeText()


def upgrade() -> None:
    """Upgrade schema."""
    # Batch mode recreates the table on SQLite (which cannot alter a column in
    # place) and issues a plain ALTER TABLE on MSSQL.
    with op.batch_alter_table('Jobs') as batch_op:
        batch_op.add_column(sa.Column('posting_date', sa.Date(), nullable=True))
        batch_op.alter_column('description',
                   existing_type=_description_type(),
                   nullable=True)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('Jobs') as batch_op:
        batch_op.alter_column('description',
                   existing_type=_description_type(),
                   nullable=False)
        batch_op.drop_column('posting_date')
