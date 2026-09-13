import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# The suite builds its own in-memory engine per test (see the `engine`
# fixture), but anything that reaches `database.get_engine()` directly must
# also land on SQLite and never on the MSSQL server named in `.env`. Set the
# URL before `database` is imported; `load_dotenv()` does not override it.
os.environ["DATABASE_URL"] = "sqlite://"
# The app refuses to start without a signing secret; tests never need a real one.
os.environ.setdefault("JWT_SECRET", "test-secret-not-for-production")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from models.user import User
from routers.dependencies import get_current_user
from services.auth import hash_password

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
import models.user  # noqa: F401
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


TEST_ADMIN_EMAIL = "tests@example.com"
TEST_ADMIN_PASSWORD = "password123"
_test_password_hash = None


def test_password_hash() -> str:
    # bcrypt is deliberately slow; hash the shared test password once.
    global _test_password_hash
    if _test_password_hash is None:
        _test_password_hash = hash_password(TEST_ADMIN_PASSWORD)
    return _test_password_hash


@pytest.fixture()
def client(engine):
    """A TestClient whose requests act as an active Admin.

    Every router except health and login sits behind `get_current_user`, so
    the dependency is overridden here with a seeded Admin. Tests that need
    the real token check (the auth and users routers, the route walk) drop
    the override with `main.app.dependency_overrides.pop(get_current_user)`.
    """
    import main

    session_factory = sessionmaker(bind=engine)

    def override_get_db():
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    def override_current_user():
        session = session_factory()
        try:
            user = session.query(User).filter(User.email == TEST_ADMIN_EMAIL).one_or_none()
            if user is None:
                user = User(
                    email=TEST_ADMIN_EMAIL,
                    full_name="Test Admin",
                    role="admin",
                    password_hash=test_password_hash(),
                    is_active=True,
                    must_change_password=False,
                )
                session.add(user)
                session.commit()
            session.refresh(user)
            return user
        finally:
            session.close()

    main.app.dependency_overrides[get_db] = override_get_db
    main.app.dependency_overrides[get_current_user] = override_current_user
    try:
        with TestClient(main.app) as test_client:
            yield test_client
    finally:
        main.app.dependency_overrides.clear()
