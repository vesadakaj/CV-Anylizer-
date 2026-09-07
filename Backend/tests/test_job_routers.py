"""HTTP-layer tests for the job listing and detail endpoints, against the
isolated SQLite database provided by the `client` fixture (never the real
database)."""

from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError

from models.candidate import Candidate
from models.job import Job
from models.job_skill import JobSkill
from models.skill import Skill


def _make_job(db, **kwargs):
    defaults = dict(title="Job", description="desc")
    defaults.update(kwargs)
    job = Job(**defaults)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def test_list_jobs_empty_returns_empty_list(client):
    response = client.get("/api/jobs")
    assert response.status_code == 200
    assert response.json() == {"jobs": [], "total_candidates": 0}


def test_list_jobs_without_requirements_is_not_ready_to_match(client, db_session):
    _make_job(db_session, title="Barista")
    response = client.get("/api/jobs")
    assert response.status_code == 200
    body = response.json()
    assert len(body["jobs"]) == 1
    job = body["jobs"][0]
    assert job["ready_to_match"] is False
    assert job["required_skills_count"] == 0
    assert job["skills"] == []


def test_list_jobs_with_required_skill_is_ready_to_match(client, db_session):
    job = _make_job(db_session, title="Backend Engineer")
    skill = Skill(name="Python")
    db_session.add(skill)
    db_session.commit()
    db_session.refresh(skill)
    db_session.add(JobSkill(job_id=job.id, skill_id=skill.id, is_required=True))
    db_session.commit()

    response = client.get("/api/jobs")
    assert response.status_code == 200
    body = response.json()["jobs"][0]
    assert body["ready_to_match"] is True
    assert body["required_skills_count"] == 1
    assert body["skills"] == [{"name": "Python", "is_required": True}]


def test_list_jobs_with_valid_required_experience_is_ready_to_match(client, db_session):
    _make_job(db_session, title="Data Analyst", required_experience_years=3)
    response = client.get("/api/jobs")
    body = response.json()["jobs"][0]
    assert body["ready_to_match"] is True


def test_list_jobs_with_mappable_required_education_is_ready_to_match(client, db_session):
    _make_job(db_session, title="Researcher", required_education="Master's degree")
    response = client.get("/api/jobs")
    body = response.json()["jobs"][0]
    assert body["ready_to_match"] is True


def test_list_jobs_orders_most_recent_first(client, db_session):
    _make_job(db_session, title="First")
    _make_job(db_session, title="Second")
    response = client.get("/api/jobs")
    titles = [job["title"] for job in response.json()["jobs"]]
    assert titles == ["Second", "First"]


def test_list_jobs_returns_total_candidate_count(client, db_session):
    db_session.add_all([Candidate(full_name="A"), Candidate(full_name="B")])
    db_session.commit()
    _make_job(db_session)

    response = client.get("/api/jobs")
    assert response.json()["total_candidates"] == 2


def test_get_job_not_found_returns_404(client):
    response = client.get("/api/jobs/999")
    assert response.status_code == 404


def test_get_job_returns_full_detail_including_description(client, db_session):
    job = _make_job(
        db_session,
        title="Backend Engineer",
        description="We need a backend engineer.",
        required_education="Bachelor's degree",
        required_experience_years=3,
    )
    skill = Skill(name="Python")
    db_session.add(skill)
    db_session.commit()
    db_session.refresh(skill)
    db_session.add(JobSkill(job_id=job.id, skill_id=skill.id, is_required=True))
    db_session.commit()

    response = client.get(f"/api/jobs/{job.id}")
    assert response.status_code == 200
    body = response.json()
    assert body["job_id"] == job.id
    assert body["title"] == "Backend Engineer"
    assert body["description"] == "We need a backend engineer."
    assert body["ready_to_match"] is True
    assert body["required_skills_count"] == 1
    assert body["skills"] == [{"name": "Python", "is_required": True}]


def test_get_job_without_requirements_is_not_ready_to_match(client, db_session):
    job = _make_job(db_session, title="Barista")
    response = client.get(f"/api/jobs/{job.id}")
    assert response.status_code == 200
    assert response.json()["ready_to_match"] is False


def _valid_create_payload(**overrides):
    payload = dict(
        title="Backend Developer",
        company_name="Acme Technologies",
        required_experience_years=3,
        required_education="Bachelor",
        required_skills=["Python", "FastAPI", "SQL"],
        posting_date="2026-09-04",
    )
    payload.update(overrides)
    return payload


def test_create_job_with_valid_fields_returns_201(client, db_session):
    response = client.post("/api/jobs", json=_valid_create_payload())
    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Backend Developer"
    assert body["company_name"] == "Acme Technologies"
    assert body["required_experience_years"] == 3
    assert body["posting_date"] == "2026-09-04"
    assert body["ready_to_match"] is True
    assert body["required_skills_count"] == 3
    assert {s["name"] for s in body["skills"]} == {"Python", "FastAPI", "SQL"}
    assert all(s["is_required"] for s in body["skills"])

    job = db_session.query(Job).filter(Job.id == body["job_id"]).first()
    assert job is not None
    assert job.description is None


def test_create_job_appears_in_list(client):
    client.post("/api/jobs", json=_valid_create_payload(title="Data Engineer"))
    response = client.get("/api/jobs")
    titles = [job["title"] for job in response.json()["jobs"]]
    assert "Data Engineer" in titles


def test_create_job_missing_title_returns_400(client):
    response = client.post("/api/jobs", json=_valid_create_payload(title="   "))
    assert response.status_code == 400


def test_create_job_missing_company_returns_400(client):
    response = client.post("/api/jobs", json=_valid_create_payload(company_name="  "))
    assert response.status_code == 400


def test_create_job_negative_experience_returns_422(client):
    response = client.post(
        "/api/jobs", json=_valid_create_payload(required_experience_years=-1)
    )
    assert response.status_code == 422


def test_create_job_accepts_zero_experience(client):
    response = client.post(
        "/api/jobs", json=_valid_create_payload(required_experience_years=0)
    )
    assert response.status_code == 201


def test_create_job_empty_skills_list_returns_422(client):
    response = client.post("/api/jobs", json=_valid_create_payload(required_skills=[]))
    assert response.status_code == 422


def test_create_job_blank_skills_only_returns_400(client):
    response = client.post(
        "/api/jobs", json=_valid_create_payload(required_skills=["   ", ""])
    )
    assert response.status_code == 400


def test_create_job_deduplicates_skills_case_insensitively(client):
    response = client.post(
        "/api/jobs",
        json=_valid_create_payload(required_skills=["Python", "python", " PYTHON ", "SQL"]),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["required_skills_count"] == 2
    assert {s["name"] for s in body["skills"]} == {"Python", "SQL"}


def test_create_job_reuses_existing_skill_record(client, db_session):
    existing = Skill(name="Python")
    db_session.add(existing)
    db_session.commit()
    db_session.refresh(existing)

    client.post("/api/jobs", json=_valid_create_payload(required_skills=["python"]))

    assert db_session.query(Skill).filter(func.lower(Skill.name) == "python").count() == 1


def test_create_job_does_not_call_nlp_extractor(client, monkeypatch):
    def _fail_if_called(*args, **kwargs):
        raise AssertionError("NLP extraction must not be called for manual job creation")

    monkeypatch.setattr("routers.job.extract_job_info", _fail_if_called)

    response = client.post("/api/jobs", json=_valid_create_payload())
    assert response.status_code == 201


def test_create_job_rolls_back_on_persistence_failure(client, db_session, monkeypatch):
    from services import job_persistence

    def _raise(*args, **kwargs):
        raise SQLAlchemyError("boom")

    monkeypatch.setattr(job_persistence.Session, "commit", _raise)

    response = client.post("/api/jobs", json=_valid_create_payload(title="Should Not Persist"))
    assert response.status_code == 500
    assert db_session.query(Job).filter(Job.title == "Should Not Persist").count() == 0


def test_create_job_persists_responsibilities_and_qualifications(client, db_session):
    response = client.post(
        "/api/jobs",
        json=_valid_create_payload(
            location="Remote",
            department="Engineering",
            employment_type="Full-time",
            description="We are hiring a backend developer...",
            responsibilities=["Build APIs", "Review code"],
            required_qualifications=["3+ years of Python"],
            preferred_qualifications=["Experience with FastAPI"],
        ),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["location"] == "Remote"
    assert body["department"] == "Engineering"
    assert body["employment_type"] == "Full-time"
    assert body["responsibilities"] == ["Build APIs", "Review code"]
    assert body["required_qualifications"] == ["3+ years of Python"]
    assert body["preferred_qualifications"] == ["Experience with FastAPI"]

    job = db_session.query(Job).filter(Job.id == body["job_id"]).first()
    assert job.description == "We are hiring a backend developer..."


def test_get_job_returns_responsibilities_and_qualifications(client):
    create_response = client.post(
        "/api/jobs",
        json=_valid_create_payload(
            responsibilities=["Build APIs"],
            required_qualifications=["3+ years of Python"],
            preferred_qualifications=["Experience with FastAPI"],
        ),
    )
    job_id = create_response.json()["job_id"]

    response = client.get(f"/api/jobs/{job_id}")
    assert response.status_code == 200
    body = response.json()
    assert body["responsibilities"] == ["Build APIs"]
    assert body["required_qualifications"] == ["3+ years of Python"]
    assert body["preferred_qualifications"] == ["Experience with FastAPI"]


def test_job_without_responsibilities_returns_empty_lists(client):
    response = client.post("/api/jobs", json=_valid_create_payload())
    body = response.json()
    assert body["responsibilities"] == []
    assert body["required_qualifications"] == []
    assert body["preferred_qualifications"] == []


def _fake_job_info(**overrides):
    """Builds a real JobInfo instance so it round-trips cleanly through the
    analyze-preview endpoint's response_model, without requiring a live LLM
    call."""
    from services.job_extraction import JobInfo, JobSkillItem

    base = dict(
        title="Backend Developer",
        company_name="Acme Technologies",
        location="Remote",
        department="Engineering",
        employment_type="Full-time",
        posting_date=None,
        required_education="Bachelor",
        required_experience_years=3,
        experience_description=None,
        skills=[JobSkillItem(name="Python", is_required=True)],
        responsibilities=["Build APIs", "Review pull requests"],
        required_qualifications=["3+ years of backend experience"],
        preferred_qualifications=["Experience with FastAPI"],
    )
    base.update(overrides)
    return JobInfo(**base)


def test_analyze_preview_does_not_create_a_job(client, db_session, monkeypatch):
    monkeypatch.setattr(
        "routers.job.extract_job_info", lambda description: _fake_job_info()
    )

    response = client.post(
        "/api/jobs/analyze-preview", json={"description": "Full job posting text..."}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["job_info"]["title"] == "Backend Developer"
    assert body["job_info"]["responsibilities"] == ["Build APIs", "Review pull requests"]
    assert body["job_info"]["required_qualifications"] == ["3+ years of backend experience"]
    assert body["job_info"]["preferred_qualifications"] == ["Experience with FastAPI"]
    assert body["description"] == "Full job posting text..."

    assert db_session.query(Job).count() == 0


def test_analyze_preview_does_not_invent_missing_fields(client, monkeypatch):
    monkeypatch.setattr(
        "routers.job.extract_job_info",
        lambda description: _fake_job_info(
            company_name=None, location=None, department=None, employment_type=None,
            required_education=None, required_experience_years=None,
            responsibilities=[], required_qualifications=[], preferred_qualifications=[],
        ),
    )

    response = client.post(
        "/api/jobs/analyze-preview", json={"description": "A short posting."}
    )
    assert response.status_code == 200
    job_info = response.json()["job_info"]
    assert job_info["company_name"] is None
    assert job_info["location"] is None
    assert job_info["responsibilities"] == []
    assert job_info["required_qualifications"] == []
    assert job_info["preferred_qualifications"] == []


def test_analyze_preview_blank_description_returns_400(client):
    response = client.post("/api/jobs/analyze-preview", json={"description": "   "})
    assert response.status_code == 400


def test_analyze_preview_extraction_failure_returns_502(client, monkeypatch):
    from services.job_extraction import JobExtractionError

    def _raise(description):
        raise JobExtractionError("LLM is unavailable")

    monkeypatch.setattr("routers.job.extract_job_info", _raise)

    response = client.post(
        "/api/jobs/analyze-preview", json={"description": "Full job posting text..."}
    )
    assert response.status_code == 502


def test_save_after_preview_creates_exactly_one_job(client, db_session, monkeypatch):
    monkeypatch.setattr(
        "routers.job.extract_job_info", lambda description: _fake_job_info()
    )

    preview = client.post(
        "/api/jobs/analyze-preview", json={"description": "Full job posting text..."}
    )
    assert db_session.query(Job).count() == 0

    job_info = preview.json()["job_info"]
    save_response = client.post(
        "/api/jobs",
        json={
            "title": job_info["title"],
            "company_name": job_info["company_name"],
            "location": job_info["location"],
            "department": job_info["department"],
            "employment_type": job_info["employment_type"],
            "required_experience_years": job_info["required_experience_years"],
            "required_education": job_info["required_education"],
            "required_skills": [s["name"] for s in job_info["skills"]],
            "responsibilities": job_info["responsibilities"],
            "required_qualifications": job_info["required_qualifications"],
            "preferred_qualifications": job_info["preferred_qualifications"],
            "description": preview.json()["description"],
        },
    )
    assert save_response.status_code == 201
    assert db_session.query(Job).count() == 1
