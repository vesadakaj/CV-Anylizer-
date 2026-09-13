"""HTTP-layer tests for the CV endpoints: upload (with the LLM and text
extraction stubbed), the per-user Unattached list and one CV's detail."""

import pytest

from models.application import Application
from models.cv import CV
from services.applications import create_or_update_applications
from services.candidate_extraction import CandidateInfo, SkillItem
from tests.conftest import TEST_MEMBER_EMAIL
from tests.factories import add_cv_skill, add_job_skill, make_candidate_with_cv, make_cv, make_job


def _info(name="Jane Doe", email="jane@x.com", skills=()):
    return CandidateInfo(
        full_name=name,
        email=email,
        phone=None,
        location=None,
        education=[],
        work_experience=[],
        projects=[],
        skills=[SkillItem(name=skill) for skill in skills],
        languages=[],
    )


@pytest.fixture()
def stub_extraction(monkeypatch):
    """Replace text extraction and the LLM call; the file bytes decide the
    extracted name/email so one test can upload several distinct CVs."""
    monkeypatch.setattr("routers.cv.extract_text", lambda extension, contents: contents.decode() or "")

    def fake_extract(text):
        name, _, rest = text.partition("|")
        email, _, skills = rest.partition("|")
        return _info(name=name, email=email or None, skills=[s for s in skills.split(",") if s])

    monkeypatch.setattr("routers.cv.extract_candidate_info", fake_extract)


def upload(client, text, *, name="cv.pdf", job_id=None):
    data = {"job_id": str(job_id)} if job_id is not None else {}
    return client.post(
        "/api/cv/upload",
        files={"file": (name, text.encode(), "application/pdf")},
        data=data,
    )


# --- POST /api/cv/upload ----------------------------------------------------


def test_upload_without_job_creates_an_unattached_cv(client, db_session, user, stub_extraction):
    response = upload(client, "Jane Doe|jane@x.com|Python")

    assert response.status_code == 200
    body = response.json()
    assert body["cv_id"] is not None
    assert body["candidate_id"] is not None
    assert body["candidate_matched_existing"] is False
    assert body["linkable"] is True
    assert body["application"] is None
    assert body["match"] is None
    assert body["candidate_info"]["full_name"] == "Jane Doe"
    cv = db_session.get(CV, body["cv_id"])
    assert cv.uploaded_by_user_id == user.id
    assert db_session.query(Application).count() == 0

    unattached = client.get("/api/cvs/unattached").json()
    assert [row["cv_id"] for row in unattached] == [body["cv_id"]]


def test_upload_with_job_creates_and_scores_the_application(client, db_session, user, stub_extraction):
    job = make_job(db_session, user, required_experience_years=None, required_education=None)
    add_job_skill(db_session, job, "Python", required=True)
    db_session.commit()

    response = upload(client, "Jane Doe|jane@x.com|Python", job_id=job.id)

    assert response.status_code == 200
    body = response.json()
    assert body["application"]["status"] == "created"
    assert body["match"]["overall_score"] == 100.0
    assert body["match"]["application_id"] == body["application"]["id"]
    # A CV uploaded for a Job is never Unattached.
    assert client.get("/api/cvs/unattached").json() == []


def test_upload_same_person_for_same_job_updates_the_application(client, db_session, user, stub_extraction):
    job = make_job(db_session, user, required_experience_years=None, required_education=None)
    add_job_skill(db_session, job, "Python", required=True)
    db_session.commit()

    first = upload(client, "Jane Doe|jane@x.com|", job_id=job.id).json()
    second = upload(client, "Jane Doe|jane@x.com|Python", name="newer.pdf", job_id=job.id).json()

    assert second["candidate_matched_existing"] is True
    assert second["candidate_id"] == first["candidate_id"]
    assert second["cv_id"] != first["cv_id"]
    assert second["application"]["status"] == "updated"
    assert second["application"]["id"] == first["application"]["id"]
    assert first["match"]["overall_score"] == 0.0
    assert second["match"]["overall_score"] == 100.0
    assert db_session.query(Application).count() == 1


def test_upload_unknown_job_is_rejected_before_extraction(client, monkeypatch):
    def _fail(*args, **kwargs):
        raise AssertionError("extraction must not run for an unknown job")

    monkeypatch.setattr("routers.cv.extract_text", _fail)
    monkeypatch.setattr("routers.cv.extract_candidate_info", _fail)

    response = upload(client, "Jane Doe|jane@x.com|", job_id=999)
    assert response.status_code == 404


def test_upload_rejects_unsupported_extension(client, stub_extraction):
    response = upload(client, "x", name="notes.txt")
    assert response.status_code == 400


def test_upload_without_extractable_text_returns_400(client, stub_extraction):
    response = upload(client, "")
    assert response.status_code == 400
    assert "scanned" in response.json()["detail"]


def test_upload_without_email_is_unlinkable(client, stub_extraction):
    first = upload(client, "Anon One||").json()
    second = upload(client, "Anon One||").json()

    assert first["linkable"] is False
    assert first["candidate_id"] != second["candidate_id"]


# --- GET /api/cvs/unattached -----------------------------------------------


def test_unattached_is_per_user_and_newest_first(client, db_session, user, member):
    _, mine_old = make_candidate_with_cv(db_session, user, "Mine Old", file_name="old.pdf")
    _, mine_new = make_candidate_with_cv(db_session, user, "Mine New", file_name="new.pdf")
    _, theirs = make_candidate_with_cv(db_session, member, "Theirs", file_name="theirs.pdf")
    db_session.commit()

    mine = client.get("/api/cvs/unattached").json()
    assert [row["cv_id"] for row in mine] == [mine_new.id, mine_old.id]
    assert mine[0]["candidate"]["full_name"] == "Mine New"
    assert mine[0]["linkable"] is False  # no email in the factory
    for key in ("cv_id", "file_name", "file_type", "uploaded_at", "linkable", "candidate"):
        assert key in mine[0]

    client.act_as(TEST_MEMBER_EMAIL)
    assert [row["cv_id"] for row in client.get("/api/cvs/unattached").json()] == [theirs.id]


def test_attached_cv_leaves_the_unattached_list(client, db_session, user):
    job = make_job(db_session, user)
    add_job_skill(db_session, job, "Python", required=True)
    _, stays = make_candidate_with_cv(db_session, user, "Stays")
    _, goes = make_candidate_with_cv(db_session, user, "Goes")
    db_session.commit()

    assert {row["cv_id"] for row in client.get("/api/cvs/unattached").json()} == {stays.id, goes.id}
    create_or_update_applications(db_session, job.id, [goes.id], user)
    assert [row["cv_id"] for row in client.get("/api/cvs/unattached").json()] == [stays.id]


# --- GET /api/cvs/{id} ------------------------------------------------------


def test_cv_detail_rebuilds_the_profile_shape(client, db_session, user):
    candidate, cv = make_candidate_with_cv(db_session, user, "Jane Doe", email="jane@x.com")
    add_cv_skill(db_session, cv, "Python")
    job = make_job(db_session, user, "Backend")
    add_job_skill(db_session, job, "Python", required=True)
    db_session.commit()
    create_or_update_applications(db_session, job.id, [cv.id], user)

    response = client.get(f"/api/cvs/{cv.id}")

    assert response.status_code == 200
    body = response.json()
    assert body["cv_id"] == cv.id
    assert body["candidate_id"] == candidate.id
    assert body["filename"] == "cv.pdf"
    assert body["uploaded_by"] == "Test Admin"
    assert body["linkable"] is True
    info = body["candidate_info"]
    assert info["full_name"] == "Jane Doe"
    assert info["email"] == "jane@x.com"
    assert [skill["name"] for skill in info["skills"]] == ["Python"]
    for key in ("education", "work_experience", "projects", "languages"):
        assert info[key] == []
    assert [application["job_title"] for application in body["applications"]] == ["Backend"]


def test_cv_detail_not_found_returns_404(client):
    assert client.get("/api/cvs/999").status_code == 404


def test_member_email_fixture_is_a_member(member):
    assert member.email == TEST_MEMBER_EMAIL
    assert member.is_admin is False
