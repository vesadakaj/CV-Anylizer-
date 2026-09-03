"""HTTP-layer tests for the job listing endpoint, against the isolated
SQLite database provided by the `client` fixture (never the real database)."""

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
    assert response.json() == {"jobs": []}


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
