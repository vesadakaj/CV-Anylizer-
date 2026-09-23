import os
from functools import lru_cache
from urllib.parse import quote_plus

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import StaticPool

load_dotenv()

Base = declarative_base()


class DatabaseConfigurationError(RuntimeError):
    pass


def database_url() -> str:
    """Resolve the SQLAlchemy URL from the environment.

    ``DATABASE_URL`` wins when set (tests use an in-memory SQLite URL, and
    it lets any SQLAlchemy backend be pointed at without code changes).
    Otherwise the MSSQL connection string is built from the ``DB_*``
    variables exactly as before, so an unchanged Windows ``.env`` keeps
    connecting to SQL Server.
    """
    url = os.getenv("DATABASE_URL")
    if url:
        return url

    server = os.getenv("DB_SERVER")
    database = os.getenv("DB_NAME")
    driver = os.getenv("DB_DRIVER")
    if not (server and database and driver):
        raise DatabaseConfigurationError(
            "No database configured. Set DATABASE_URL, or DB_SERVER, "
            "DB_NAME and DB_DRIVER, in the backend .env file."
        )

    connection_string = (
        f"DRIVER={{{driver}}};"
        f"SERVER={server};"
        f"DATABASE={database};"
        f"Trusted_Connection=yes;"
        f"TrustServerCertificate=yes;"
    )
    return f"mssql+pyodbc:///?odbc_connect={quote_plus(connection_string)}"


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """Create the engine on first use, not at import time.

    Importing this module must never require a database driver: the test
    suite imports the app on machines without unixODBC, and Alembic and the
    API share this one entry point so they can never disagree on the URL.
    """
    url = database_url()
    kwargs = {}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
        if url in ("sqlite://", "sqlite:///:memory:"):
            # One shared connection, or every session sees an empty database.
            kwargs["poolclass"] = StaticPool
    return create_engine(url, **kwargs)


SessionLocal = sessionmaker(autocommit=False, autoflush=False)


def get_db():
    db = SessionLocal(bind=get_engine())

    try:
        yield db
    finally:
        db.close()
