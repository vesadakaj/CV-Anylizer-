from logging.config import fileConfig

from alembic import context

from database import Base, database_url, get_engine
from models.candidate import Candidate
from models.cv import CV
from models.education import Education
from models.work_experience import WorkExperience
from models.skill import Skill
from models.cv_skill import CvSkill
from models.language import Language
from models.cv_language import CvLanguage
from models.project import Project
from models.job import Job
from models.job_skill import JobSkill
from models.application import Application
from models.match_result import MatchResult
from models.user import User

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


target_metadata = Base.metadata

# Autogenerate wraps table alterations in `with op.batch_alter_table(...)`
# instead of emitting a bare op.alter_column/op.drop_column. SQLite has no
# ALTER for those, so batch mode recreates the table, copies the rows and
# renames; on MSSQL it passes straight through to a plain ALTER TABLE.
# Migrations here are authored once and have to run on both, so without this
# a generated revision works in production and fails on SQLite -- exactly how
# 0d7648a5ece7 broke `alembic upgrade head` for the test and dev databases.


def run_migrations_offline() -> None:
    context.configure(
        url=database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        render_as_batch=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    with get_engine().connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            render_as_batch=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
