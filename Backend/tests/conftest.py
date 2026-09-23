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
os.environ.setdefault("JWT_SECRET", "test-secret-not-for-production-0123456789")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from models.user import ROLE_ADMIN, ROLE_MEMBER, User
from routers.dependencies import get_current_user
from services.auth import hash_password

# Import every model so its table is registered on Base.metadata before
# create_all() runs.
import models.application  # noqa: F401
import models.candidate  # noqa: F401
import models.cv  # noqa: F401
import models.cv_language  # noqa: F401
import models.cv_skill  # noqa: F401
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
TEST_MEMBER_EMAIL = "member@example.com"
TEST_ADMIN_PASSWORD = "password123"
_test_password_hash = None


def test_password_hash() -> str:
    # bcrypt is deliberately slow; hash the shared test password once.
    global _test_password_hash
    if _test_password_hash is None:
        _test_password_hash = hash_password(TEST_ADMIN_PASSWORD)
    return _test_password_hash


def get_or_create_user(db, email: str, *, role: str = ROLE_MEMBER, full_name: str | None = None) -> User:
    """A User row for tests, created once per database. Every account
    shares TEST_ADMIN_PASSWORD."""
    user = db.query(User).filter(User.email == email).one_or_none()
    if user is None:
        user = User(
            email=email,
            full_name=full_name or email.split("@")[0].replace(".", " ").title(),
            role=role,
            password_hash=test_password_hash(),
            is_active=True,
            must_change_password=False,
        )
        db.add(user)
        db.commit()
    db.refresh(user)
    return user


@pytest.fixture()
def user(db_session):
    """The seeded Admin the `client` fixture acts as, available to tests that
    create Jobs and CVs directly (both need an owner)."""
    return get_or_create_user(db_session, TEST_ADMIN_EMAIL, role=ROLE_ADMIN, full_name="Test Admin")


@pytest.fixture()
def member(db_session):
    return get_or_create_user(db_session, TEST_MEMBER_EMAIL, role=ROLE_MEMBER, full_name="Test Member")


def _install_client(engine, acting_email: str | None, acting_role: str):
    """Build a TestClient over `engine`. With `acting_email` the
    `get_current_user` dependency is overridden by that (seeded) account;
    without it the real Bearer check runs."""
    import main

    session_factory = sessionmaker(bind=engine)
    acting = {"email": acting_email, "role": acting_role}

    def override_get_db():
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    def override_current_user():
        session = session_factory()
        try:
            return get_or_create_user(session, acting["email"], role=acting["role"])
        finally:
            session.close()

    main.app.dependency_overrides[get_db] = override_get_db
    if acting_email is not None:
        main.app.dependency_overrides[get_current_user] = override_current_user
    try:
        with TestClient(main.app) as test_client:
            # Overrides are global to the app, so one test cannot hold two
            # clients with different identities; switch this one instead.
            def act_as(email: str, role: str = ROLE_MEMBER):
                acting["email"] = email
                acting["role"] = role

            test_client.act_as = act_as
            yield test_client
    finally:
        main.app.dependency_overrides.clear()


@pytest.fixture()
def client(engine):
    """A TestClient whose requests act as an active Admin.

    Every router except health and login sits behind `get_current_user`, so
    the dependency is overridden here with a seeded Admin. Use
    `member_client` to act as a Member and `anon_client` for the real
    token check (the auth and users routers, the route walk).
    """
    yield from _install_client(engine, TEST_ADMIN_EMAIL, ROLE_ADMIN)


@pytest.fixture()
def member_client(engine):
    yield from _install_client(engine, TEST_MEMBER_EMAIL, ROLE_MEMBER)


@pytest.fixture()
def anon_client(engine):
    """No dependency override: requests carry whatever Authorization header
    the test sets, and are rejected without one."""
    yield from _install_client(engine, None, ROLE_MEMBER)
