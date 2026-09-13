"""Phase 0 groundwork: lazy engine, URL override, shared LLM client, CORS."""

import pytest

import database
from main import parse_cors_origins
from services import llm
from services.candidate_extraction import (
    CandidateExtractionError,
    extract_candidate_info,
)
from services.job_extraction import JobExtractionError, extract_job_info


@pytest.fixture(autouse=True)
def _fresh_caches():
    database.get_engine.cache_clear()
    llm.get_client.cache_clear()
    yield
    database.get_engine.cache_clear()
    llm.get_client.cache_clear()


# --- database URL resolution -------------------------------------------------


def test_database_url_prefers_explicit_url(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./somewhere.db")
    monkeypatch.setenv("DB_SERVER", "ignored")
    assert database.database_url() == "sqlite:///./somewhere.db"


def test_database_url_builds_mssql_string_from_db_variables(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("DB_SERVER", "localhost\\SQLEXPRESS")
    monkeypatch.setenv("DB_NAME", "cv_analyzer")
    monkeypatch.setenv("DB_DRIVER", "ODBC Driver 18 for SQL Server")

    url = database.database_url()

    assert url.startswith("mssql+pyodbc:///?odbc_connect=")
    assert "DRIVER%3D%7BODBC+Driver+18+for+SQL+Server%7D" in url
    assert "SERVER%3Dlocalhost%5CSQLEXPRESS" in url
    assert "DATABASE%3Dcv_analyzer" in url
    assert "Trusted_Connection%3Dyes" in url


def test_database_url_without_any_configuration_is_a_clear_error(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    for name in ("DB_SERVER", "DB_NAME", "DB_DRIVER"):
        monkeypatch.delenv(name, raising=False)

    with pytest.raises(database.DatabaseConfigurationError, match="DATABASE_URL"):
        database.database_url()


def test_engine_is_created_once_and_only_on_first_use(monkeypatch):
    calls = []
    real_create_engine = database.create_engine

    def counting_create_engine(url, **kwargs):
        calls.append(url)
        return real_create_engine(url, **kwargs)

    monkeypatch.setattr(database, "create_engine", counting_create_engine)
    monkeypatch.setenv("DATABASE_URL", "sqlite://")

    assert calls == []
    first = database.get_engine()
    second = database.get_engine()

    assert first is second
    assert calls == ["sqlite://"]


def test_get_db_yields_a_session_bound_to_the_lazy_engine(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite://")

    generator = database.get_db()
    session = next(generator)
    try:
        assert session.get_bind() is database.get_engine()
    finally:
        generator.close()


# --- shared LLM client --------------------------------------------------------


def test_missing_llm_key_fails_at_first_use_with_a_clear_message(monkeypatch):
    monkeypatch.delenv("LLM_API_KEY", raising=False)

    with pytest.raises(llm.LLMConfigurationError, match="LLM_API_KEY"):
        llm.get_client()


def test_llm_client_is_built_once(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "test-key")

    assert llm.get_client() is llm.get_client()


def test_extractors_report_missing_key_as_their_own_error(monkeypatch):
    monkeypatch.delenv("LLM_API_KEY", raising=False)

    with pytest.raises(CandidateExtractionError, match="LLM_API_KEY"):
        extract_candidate_info("some cv text")
    with pytest.raises(JobExtractionError, match="LLM_API_KEY"):
        extract_job_info("some job text")


def test_extractors_use_the_shared_client(monkeypatch):
    class FakeMessages:
        def parse(self, **kwargs):
            raise AssertionError("shared client reached")

    class FakeClient:
        messages = FakeMessages()

    monkeypatch.setenv("LLM_API_KEY", "test-key")
    monkeypatch.setattr(llm, "get_client", lambda: FakeClient())
    monkeypatch.setattr(
        "services.candidate_extraction.get_client", lambda: FakeClient()
    )
    monkeypatch.setattr("services.job_extraction.get_client", lambda: FakeClient())

    with pytest.raises(AssertionError, match="shared client reached"):
        extract_candidate_info("cv")
    with pytest.raises(AssertionError, match="shared client reached"):
        extract_job_info("job")


# --- leftovers and CORS -------------------------------------------------------


def test_test_candidate_route_is_gone(client):
    assert client.post("/test-candidate").status_code == 404


def test_cors_origins_default():
    assert parse_cors_origins(None) == ["http://localhost:5173"]
    assert parse_cors_origins("   ") == ["http://localhost:5173"]


def test_cors_origins_are_split_and_trimmed():
    assert parse_cors_origins(
        "http://localhost:5173, https://cv.example.com ,,"
    ) == ["http://localhost:5173", "https://cv.example.com"]
