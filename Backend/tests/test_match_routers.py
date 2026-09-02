"""HTTP-layer tests for the matching endpoints, against the isolated SQLite
database provided by the `client` fixture (never the real database)."""

from models.candidate import Candidate
from models.job import Job


def _make_candidate(db, name="Candidate"):
    candidate = Candidate(full_name=name)
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return candidate


def _make_job(db, title="Job"):
    job = Job(title=title, description="desc")
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def test_match_candidate_not_found_returns_404(client, db_session):
    job = _make_job(db_session)
    response = client.post(f"/api/match/999/{job.id}")
    assert response.status_code == 404


def test_match_job_not_found_returns_404(client, db_session):
    candidate = _make_candidate(db_session)
    response = client.post(f"/api/match/{candidate.id}/999")
    assert response.status_code == 404


def test_match_returns_expected_shape(client, db_session):
    candidate = _make_candidate(db_session)
    job = _make_job(db_session)
    response = client.post(f"/api/match/{candidate.id}/{job.id}")
    assert response.status_code == 200
    body = response.json()
    for key in (
        "candidate_id",
        "job_id",
        "overall_score",
        "skill_score",
        "experience_score",
        "education_score",
        "language_score",
        "matched_skills",
        "missing_required_skills",
        "candidate_experience_years",
        "required_experience_years",
        "available_criteria",
        "effective_weights",
        "explanation",
    ):
        assert key in body
    assert body["language_score"] is None


def test_ranking_job_not_found_returns_404(client):
    response = client.get("/api/jobs/999/matches")
    assert response.status_code == 404


def test_ranking_empty_candidates_returns_valid_shape(client, db_session):
    job = _make_job(db_session)
    response = client.get(f"/api/jobs/{job.id}/matches")
    assert response.status_code == 200
    body = response.json()
    assert body["total_candidates"] == 0
    assert body["candidates"] == []


def test_ranking_rejects_invalid_minimum_score(client, db_session):
    job = _make_job(db_session)
    response = client.get(f"/api/jobs/{job.id}/matches", params={"minimum_score": 150})
    assert response.status_code == 422


def test_ranking_rejects_invalid_limit(client, db_session):
    job = _make_job(db_session)
    response = client.get(f"/api/jobs/{job.id}/matches", params={"limit": 0})
    assert response.status_code == 422


def test_ranking_rejects_negative_offset(client, db_session):
    job = _make_job(db_session)
    response = client.get(f"/api/jobs/{job.id}/matches", params={"offset": -1})
    assert response.status_code == 422
