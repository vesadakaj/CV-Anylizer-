"""HTTP-layer tests for the Application endpoints: scoring a batch against
a Job, one Application's breakdown, the Job ranking, and adding a Candidate
to a Job. Against the isolated SQLite database of the `client` fixture."""

from models.application import Application
from services.applications import create_or_update_applications
from tests.factories import (
    add_cv_skill,
    add_job_skill,
    make_candidate_with_cv,
    make_cv,
    make_job,
)


def _ready_job(db, user, title="Job"):
    job = make_job(db, user, title, required_experience_years=None, required_education=None)
    add_job_skill(db, job, "Python", required=True)
    add_job_skill(db, job, "SQL", required=True)
    db.commit()
    return job


# --- POST /api/jobs/{id}/applications ---------------------------------------


def test_apply_cvs_creates_one_application_per_cv_with_match(client, db_session, user):
    job = _ready_job(db_session, user)
    _, strong = make_candidate_with_cv(db_session, user, "Strong")
    add_cv_skill(db_session, strong, "Python")
    add_cv_skill(db_session, strong, "SQL")
    _, weak = make_candidate_with_cv(db_session, user, "Weak")
    db_session.commit()

    response = client.post(f"/api/jobs/{job.id}/applications", json={"cv_ids": [strong.id, weak.id]})

    assert response.status_code == 201
    rows = response.json()
    assert [row["candidate_name"] for row in rows] == ["Strong", "Weak"]
    assert all(row["status"] == "created" for row in rows)
    assert rows[0]["cv_id"] == strong.id
    assert rows[0]["match"]["overall_score"] == 100.0
    assert rows[0]["match"]["status"] == "scored"
    assert rows[1]["match"]["overall_score"] == 0.0
    for key in ("application_id", "job_id", "candidate_id", "cv_id", "candidate_name", "status", "match"):
        assert key in rows[0]
    assert db_session.query(Application).count() == 2


def test_apply_same_candidate_again_updates_instead_of_duplicating(client, db_session, user):
    job = _ready_job(db_session, user)
    candidate, first = make_candidate_with_cv(db_session, user, "Jane", email="jane@x.com")
    second = make_cv(db_session, candidate, user, file_name="second.pdf")
    add_cv_skill(db_session, second, "Python")
    db_session.commit()

    created = client.post(f"/api/jobs/{job.id}/applications", json={"cv_ids": [first.id]}).json()[0]
    updated = client.post(f"/api/jobs/{job.id}/applications", json={"cv_ids": [second.id]}).json()[0]

    assert created["status"] == "created"
    assert updated["status"] == "updated"
    assert updated["application_id"] == created["application_id"]
    assert updated["cv_id"] == second.id
    assert updated["match"]["overall_score"] == 50.0
    assert db_session.query(Application).count() == 1


def test_apply_unknown_job_returns_404(client, db_session, user):
    _, cv = make_candidate_with_cv(db_session, user)
    db_session.commit()
    response = client.post("/api/jobs/999/applications", json={"cv_ids": [cv.id]})
    assert response.status_code == 404


def test_apply_unknown_cv_returns_404_and_creates_nothing(client, db_session, user):
    job = _ready_job(db_session, user)
    _, cv = make_candidate_with_cv(db_session, user)
    db_session.commit()

    response = client.post(f"/api/jobs/{job.id}/applications", json={"cv_ids": [cv.id, 999]})

    assert response.status_code == 404
    assert db_session.query(Application).count() == 0


def test_apply_empty_batch_returns_422(client, db_session, user):
    job = _ready_job(db_session, user)
    response = client.post(f"/api/jobs/{job.id}/applications", json={"cv_ids": []})
    assert response.status_code == 422


# --- GET /api/applications/{id}/match --------------------------------------


def test_application_match_returns_expected_shape(client, db_session, user):
    job = _ready_job(db_session, user)
    _, cv = make_candidate_with_cv(db_session, user, "Jane")
    add_cv_skill(db_session, cv, "Python")
    db_session.commit()
    application_id = client.post(
        f"/api/jobs/{job.id}/applications", json={"cv_ids": [cv.id]}
    ).json()[0]["application_id"]

    response = client.get(f"/api/applications/{application_id}/match")

    assert response.status_code == 200
    body = response.json()
    for key in (
        "application_id",
        "candidate_id",
        "cv_id",
        "job_id",
        "candidate_name",
        "job_title",
        "status",
        "algorithm_version",
        "overall_score",
        "skill_score",
        "experience_score",
        "education_score",
        "language_score",
        "matched_skills",
        "missing_required_skills",
        "matched_required_skills_count",
        "total_required_skills",
        "candidate_experience_years",
        "required_experience_years",
        "candidate_education_level",
        "required_education_level",
        "preferred_skills_matched",
        "total_preferred_skills",
        "available_criteria",
        "effective_weights",
        "explanation",
    ):
        assert key in body
    assert body["application_id"] == application_id
    assert body["cv_id"] == cv.id
    assert body["overall_score"] == 50.0
    assert body["matched_skills"] == ["Python"]
    assert body["missing_required_skills"] == ["SQL"]
    assert body["language_score"] is None


def test_application_match_not_found_returns_404(client):
    assert client.get("/api/applications/999/match").status_code == 404


def test_old_pair_match_route_is_gone(client):
    assert client.post("/api/match/1/1").status_code == 404


# --- GET /api/jobs/{id}/matches --------------------------------------------


def test_ranking_job_not_found_returns_404(client):
    response = client.get("/api/jobs/999/matches")
    assert response.status_code == 404


def test_ranking_empty_returns_valid_shape(client, db_session, user):
    job = _ready_job(db_session, user)
    response = client.get(f"/api/jobs/{job.id}/matches")
    assert response.status_code == 200
    body = response.json()
    assert body["job_id"] == job.id
    assert body["total_applications"] == 0
    assert body["returned_applications"] == 0
    assert body["applications"] == []
    assert "total_candidates" not in body
    assert "candidates" not in body


def test_ranking_rows_are_summary_only(client, db_session, user):
    job = _ready_job(db_session, user, title="Backend")
    _, strong = make_candidate_with_cv(db_session, user, "Strong")
    add_cv_skill(db_session, strong, "Python")
    add_cv_skill(db_session, strong, "SQL")
    _, weak = make_candidate_with_cv(db_session, user, "Weak")
    db_session.commit()
    create_or_update_applications(db_session, job.id, [weak.id, strong.id], user)

    body = client.get(f"/api/jobs/{job.id}/matches").json()

    assert body["job_title"] == "Backend"
    assert body["total_applications"] == 2
    assert [row["candidate_name"] for row in body["applications"]] == ["Strong", "Weak"]
    assert [row["rank"] for row in body["applications"]] == [1, 2]
    first = body["applications"][0]
    assert set(first) == {
        "rank",
        "application_id",
        "candidate_id",
        "cv_id",
        "candidate_name",
        "status",
        "overall_score",
    }
    assert first["status"] == "scored"
    assert first["cv_id"] == strong.id


def test_ranking_lists_only_this_jobs_applications(client, db_session, user):
    job_a = _ready_job(db_session, user, "A")
    job_b = _ready_job(db_session, user, "B")
    _, cv_a = make_candidate_with_cv(db_session, user, "Only A")
    _, cv_b = make_candidate_with_cv(db_session, user, "Only B")
    db_session.commit()
    create_or_update_applications(db_session, job_a.id, [cv_a.id], user)
    create_or_update_applications(db_session, job_b.id, [cv_b.id], user)

    names = [row["candidate_name"] for row in client.get(f"/api/jobs/{job_a.id}/matches").json()["applications"]]
    assert names == ["Only A"]


def test_ranking_rejects_invalid_minimum_score(client, db_session, user):
    job = _ready_job(db_session, user)
    response = client.get(f"/api/jobs/{job.id}/matches", params={"minimum_score": 150})
    assert response.status_code == 422


def test_ranking_rejects_invalid_limit(client, db_session, user):
    job = _ready_job(db_session, user)
    response = client.get(f"/api/jobs/{job.id}/matches", params={"limit": 0})
    assert response.status_code == 422


def test_ranking_rejects_negative_offset(client, db_session, user):
    job = _ready_job(db_session, user)
    response = client.get(f"/api/jobs/{job.id}/matches", params={"offset": -1})
    assert response.status_code == 422


# --- POST /api/candidates/{id}/applications ---------------------------------


def test_add_candidate_to_job_uses_newest_cv_by_default(client, db_session, user):
    job = _ready_job(db_session, user)
    candidate, old_cv = make_candidate_with_cv(db_session, user, "Jane", email="jane@x.com")
    new_cv = make_cv(db_session, candidate, user, file_name="new.pdf")
    add_cv_skill(db_session, new_cv, "Python")
    db_session.commit()

    response = client.post(f"/api/candidates/{candidate.id}/applications", json={"job_id": job.id})

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "created"
    assert body["cv_id"] == new_cv.id
    assert body["candidate_id"] == candidate.id
    assert body["match"]["overall_score"] == 50.0


def test_add_candidate_to_job_with_explicit_cv(client, db_session, user):
    job = _ready_job(db_session, user)
    candidate, old_cv = make_candidate_with_cv(db_session, user, "Jane", email="jane@x.com")
    make_cv(db_session, candidate, user, file_name="new.pdf")
    db_session.commit()

    response = client.post(
        f"/api/candidates/{candidate.id}/applications", json={"job_id": job.id, "cv_id": old_cv.id}
    )

    assert response.status_code == 201
    assert response.json()["cv_id"] == old_cv.id


def test_add_candidate_to_job_refuses_another_candidates_cv(client, db_session, user):
    job = _ready_job(db_session, user)
    candidate, _ = make_candidate_with_cv(db_session, user, "Jane", email="jane@x.com")
    _, other_cv = make_candidate_with_cv(db_session, user, "Other", email="other@x.com")
    db_session.commit()

    response = client.post(
        f"/api/candidates/{candidate.id}/applications", json={"job_id": job.id, "cv_id": other_cv.id}
    )

    assert response.status_code == 400
    assert db_session.query(Application).count() == 0


def test_add_candidate_to_job_again_reports_updated(client, db_session, user):
    job = _ready_job(db_session, user)
    candidate, _ = make_candidate_with_cv(db_session, user, "Jane", email="jane@x.com")
    db_session.commit()

    first = client.post(f"/api/candidates/{candidate.id}/applications", json={"job_id": job.id}).json()
    second = client.post(f"/api/candidates/{candidate.id}/applications", json={"job_id": job.id}).json()

    assert first["status"] == "created"
    assert second["status"] == "updated"
    assert second["application_id"] == first["application_id"]


def test_add_candidate_not_found_returns_404(client, db_session, user):
    job = _ready_job(db_session, user)
    assert client.post("/api/candidates/999/applications", json={"job_id": job.id}).status_code == 404


def test_add_candidate_to_unknown_job_returns_404(client, db_session, user):
    candidate, _ = make_candidate_with_cv(db_session, user)
    db_session.commit()
    assert client.post(f"/api/candidates/{candidate.id}/applications", json={"job_id": 999}).status_code == 404


def test_add_candidate_without_cv_returns_404(client, db_session, user):
    from tests.factories import make_candidate

    job = _ready_job(db_session, user)
    candidate = make_candidate(db_session, "No CV")
    db_session.commit()
    assert client.post(f"/api/candidates/{candidate.id}/applications", json={"job_id": job.id}).status_code == 404
