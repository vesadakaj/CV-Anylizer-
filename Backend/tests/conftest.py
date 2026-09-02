import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db

# Import every model so its table is registered on Base.metadata before
# create_all() runs.
import models.candidate  # noqa: F401
import models.candidate_language  # noqa: F401
import models.candidate_skill  # noqa: F401
import models.cv  # noqa: F401
import models.education  # noqa: F401
import models.job  # noqa: F401
import models.job_skill  # noqa: F401
import models.language  # noqa: F401
import models.match_result  # noqa: F401
import models.project  # noqa: F401
import models.skill  # noqa: F401
import models.work_experience  # noqa: F401


@pytest.fixture()
def engine():
    """An isolated in-memory SQLite database - the tests never touch the
    real (MSSQL) database configured in .env."""
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture()
def db_session(engine):
    session_factory = sessionmaker(bind=engine)
    session = session_factory()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(engine):
    import main

    session_factory = sessionmaker(bind=engine)

    def override_get_db():
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    main.app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(main.app) as test_client:
            yield test_client
    finally:
        main.app.dependency_overrides.clear()
