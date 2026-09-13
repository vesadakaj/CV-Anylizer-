"""profile moves from candidate to cv (W2.1)

The five profile tables (WorkExperience, Education, Projects,
CandidateSkills, CandidateLanguages) hang off the CV row instead of the
Candidate (ADR 0001). CVs record their uploader, and Candidates gain the
normalised email that is the one deduplication key.

The database is empty at this point in the project, so the profile tables
are dropped and recreated rather than migrated: their foreign keys were
created unnamed, which makes an in-place column swap fragile on MSSQL.

Revision ID: c2d1e0f9a8b7
Revises: b1a2c3d4e5f6
Create Date: 2026-09-13 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c2d1e0f9a8b7'
down_revision: Union[str, Sequence[str], None] = 'b1a2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMAIL_NOT_NULL = sa.text('email_normalized IS NOT NULL')


def _ensure_candidates_table() -> None:
    """Candidates predates Alembic in this project: the two baseline
    revisions are empty because the table already existed on the MSSQL
    server. A fresh database (the test suite, a new machine) therefore has
    no Candidates at this point, so create it here when it is absent. The
    downgrade leaves it in place, exactly as the baselines do."""
    if sa.inspect(op.get_bind()).has_table('Candidates'):
        return
    op.create_table('Candidates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('full_name', sa.String(length=200), nullable=False),
        sa.Column('email', sa.String(length=200), nullable=True),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('location', sa.String(length=200), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_Candidates_id'), 'Candidates', ['id'], unique=False)


def _drop_profile_tables() -> None:
    for table in ('WorkExperience', 'Education', 'Projects', 'CandidateSkills', 'CandidateLanguages'):
        op.drop_index(op.f(f'ix_{table}_id'), table_name=table)
        op.drop_table(table)


def _create_profile_tables(owner_column: str, owner_table: str) -> None:
    """Create the five profile tables keyed by `owner_column` -> `owner_table`.id.

    Called with ('cv_id', 'CVs') on upgrade and ('candidate_id', 'Candidates')
    on downgrade so the two directions cannot drift apart.
    """
    owner_fk = sa.ForeignKeyConstraint([owner_column], [f'{owner_table}.id'])

    op.create_table('WorkExperience',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column(owner_column, sa.Integer(), nullable=False),
        sa.Column('company_name', sa.String(length=255), nullable=False),
        sa.Column('position_title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.UnicodeText(), nullable=True),
        sa.Column('start_date', sa.Date(), nullable=True),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('is_current', sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint([owner_column], [f'{owner_table}.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table('Education',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column(owner_column, sa.Integer(), nullable=False),
        sa.Column('institution', sa.String(length=255), nullable=False),
        sa.Column('degree', sa.String(length=200), nullable=True),
        sa.Column('field_of_study', sa.String(length=200), nullable=True),
        sa.Column('start_date', sa.Date(), nullable=True),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('description', sa.UnicodeText(), nullable=True),
        sa.ForeignKeyConstraint([owner_column], [f'{owner_table}.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table('Projects',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column(owner_column, sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.UnicodeText(), nullable=True),
        sa.Column('technologies', sa.String(length=500), nullable=True),
        sa.Column('project_url', sa.String(length=500), nullable=True),
        sa.ForeignKeyConstraint([owner_column], [f'{owner_table}.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table('CandidateSkills',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column(owner_column, sa.Integer(), nullable=False),
        sa.Column('skill_id', sa.Integer(), nullable=False),
        sa.Column('years_experience', sa.Float(), nullable=True),
        sa.Column('proficiency_level', sa.String(length=50), nullable=True),
        sa.ForeignKeyConstraint([owner_column], [f'{owner_table}.id']),
        sa.ForeignKeyConstraint(['skill_id'], ['Skills.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table('CandidateLanguages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column(owner_column, sa.Integer(), nullable=False),
        sa.Column('language_id', sa.Integer(), nullable=False),
        sa.Column('level', sa.String(length=50), nullable=True),
        sa.ForeignKeyConstraint([owner_column], [f'{owner_table}.id']),
        sa.ForeignKeyConstraint(['language_id'], ['Languages.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    for table in ('WorkExperience', 'Education', 'Projects', 'CandidateSkills', 'CandidateLanguages'):
        op.create_index(op.f(f'ix_{table}_id'), table, ['id'], unique=False)


def upgrade() -> None:
    """Upgrade schema."""
    _ensure_candidates_table()
    _drop_profile_tables()

    # Batch mode recreates the table on SQLite (which cannot add a NOT NULL
    # column in place) and issues a plain ALTER TABLE on MSSQL.
    with op.batch_alter_table('CVs') as batch_op:
        batch_op.add_column(sa.Column('uploaded_by_user_id', sa.Integer(), nullable=False))
        batch_op.create_foreign_key(
            'fk_CVs_uploaded_by_user_id_Users', 'Users', ['uploaded_by_user_id'], ['id']
        )

    with op.batch_alter_table('Candidates') as batch_op:
        batch_op.add_column(sa.Column('email_normalized', sa.String(length=200), nullable=True))
    op.create_index(
        'ix_Candidates_email_normalized',
        'Candidates',
        ['email_normalized'],
        unique=True,
        mssql_where=EMAIL_NOT_NULL,
        sqlite_where=EMAIL_NOT_NULL,
    )

    _create_profile_tables('cv_id', 'CVs')
    for table in ('WorkExperience', 'Education', 'Projects', 'CandidateSkills', 'CandidateLanguages'):
        op.create_index(op.f(f'ix_{table}_cv_id'), table, ['cv_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    for table in ('WorkExperience', 'Education', 'Projects', 'CandidateSkills', 'CandidateLanguages'):
        op.drop_index(op.f(f'ix_{table}_cv_id'), table_name=table)
    _drop_profile_tables()

    op.drop_index('ix_Candidates_email_normalized', table_name='Candidates')
    with op.batch_alter_table('Candidates') as batch_op:
        batch_op.drop_column('email_normalized')

    with op.batch_alter_table('CVs') as batch_op:
        batch_op.drop_constraint('fk_CVs_uploaded_by_user_id_Users', type_='foreignkey')
        batch_op.drop_column('uploaded_by_user_id')

    _create_profile_tables('candidate_id', 'Candidates')
