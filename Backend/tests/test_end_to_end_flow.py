"""The W4.2 verification scenario, scripted against the HTTP API with real
tokens (no dependency overrides): create the first Admin with the CLI
script → log in → create a user → upload three CVs (two sharing an email)
→ score them against a Job → open the matches → add one Candidate to a
second Job → check the first Job's score did not move.

Only text extraction and the LLM call are stubbed; everything else is the
real code path on the isolated SQLite database.
"""

import pytest

from models.application import Application
from models.candidate import Candidate
from models.cv import CV
from models.user import User
from scripts.create_admin import create_admin, main as create_admin_main
from services.candidate_extraction import CandidateInfo, SkillItem


@pytest.fixture()
def stub_extraction(monkeypatch):
    monkeypatch.setattr("routers.cv.extract_text", lambda extension, contents: contents.decode())

    def fake_extract(text):
        name, _, rest = text.partition("|")
        email, _, skills = rest.partition("|")
        return CandidateInfo(
            full_name=name,
            email=email or None,
            phone=None,
            location=None,
            education=[],
            work_experience=[],
            projects=[],
            skills=[SkillItem(name=skill) for skill in skills.split(",") if skill],
            languages=[],
        )

    monkeypatch.setattr("routers.cv.extract_candidate_info", fake_extract)


def upload(client, headers, text, name, job_id=None):
    data = {"job_id": str(job_id)} if job_id is not None else {}
    response = client.post(
        "/api/cv/upload",
        files={"file": (name, text.encode(), "application/pdf")},
        data=data,
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_create_admin_script_refuses_duplicates_and_bad_input(db_session):
    admin = create_admin(db_session, email=" Admin@Example.com ", full_name=" Ada ", password="adminpass1")
    assert admin.email == "admin@example.com"
    assert admin.full_name == "Ada"
    assert admin.is_admin
    assert admin.must_change_password is False

    with pytest.raises(ValueError, match="already exists"):
        create_admin(db_session, email="admin@example.com", full_name="Again", password="adminpass1")
    with pytest.raises(ValueError):
        create_admin(db_session, email="not-an-email", full_name="X", password="adminpass1")
    with pytest.raises(ValueError):
        create_admin(db_session, email="x@example.com", full_name="  ", password="adminpass1")


def test_create_admin_script_non_interactive(engine, monkeypatch, capsys):
    import database
    import scripts.create_admin as script

    monkeypatch.setattr(script, "get_engine", lambda: engine)
    monkeypatch.setattr(database, "get_engine", lambda: engine)
    monkeypatch.setenv("ADMIN_PASSWORD", "adminpass1")

    exit_code = create_admin_main(
        ["--email", "cli@example.com", "--full-name", "CLI Admin", "--password-env", "ADMIN_PASSWORD"]
    )

    assert exit_code == 0
    assert "Created admin CLI Admin <cli@example.com>" in capsys.readouterr().out
    # A second run with the same email is refused without touching the row.
    assert create_admin_main(["--email", "cli@example.com", "--full-name", "X", "--password-env", "ADMIN_PASSWORD"]) == 1


def test_full_flow(anon_client, db_session, stub_extraction):
    client = anon_client

    # 1. create admin (the CLI's function, same code path as the script)
    create_admin(db_session, email="admin@example.com", full_name="Ada Admin", password="adminpass1")

    # 2. log in
    login = client.post("/api/auth/login", json={"email": "admin@example.com", "password": "adminpass1"})
    assert login.status_code == 200
    admin = {"Authorization": f"Bearer {login.json()['token']}"}
    assert login.json()["user"]["must_change_password"] is False

    # 3. create a user; they must change the temporary password first
    created = client.post(
        "/api/users",
        json={"email": "hr@example.com", "full_name": "HR Member", "role": "member", "temporary_password": "temporary1"},
        headers=admin,
    )
    assert created.status_code == 201
    member_login = client.post("/api/auth/login", json={"email": "hr@example.com", "password": "temporary1"})
    assert member_login.json()["user"]["must_change_password"] is True
    member = {"Authorization": f"Bearer {member_login.json()['token']}"}
    changed = client.post(
        "/api/auth/change-password",
        json={"current_password": "temporary1", "new_password": "chosenpass1"},
        headers=member,
    )
    assert changed.status_code == 200 and changed.json()["must_change_password"] is False
    # A Member cannot manage users but can do everything else.
    assert client.get("/api/users", headers=member).status_code == 403

    # A Job to score against, created by the member through the review path.
    job = client.post(
        "/api/jobs",
        json={
            "title": "Backend Developer",
            "company_name": "Acme",
            "required_experience_years": 0,
            "skills": [{"name": "Python", "is_required": True}, {"name": "SQL", "is_required": True}, {"name": "Docker", "is_required": False}],
        },
        headers=member,
    )
    assert job.status_code == 201
    job_id = job.json()["job_id"]
    assert job.json()["created_by"] == "HR Member"
    assert job.json()["required_skills"] == ["Python", "SQL"]
    assert job.json()["preferred_skills"] == ["Docker"]

    # 4. upload three CVs, two sharing an email
    first = upload(client, member, "Jane Doe|jane@x.com|Python", "jane-v1.pdf")
    second = upload(client, member, "Jane Doe|Jane@X.com|Python,SQL,Docker", "jane-v2.pdf")
    third = upload(client, member, "John Smith|john@x.com|SQL", "john.pdf")
    assert second["candidate_matched_existing"] is True
    assert second["candidate_id"] == first["candidate_id"]
    assert third["candidate_id"] != first["candidate_id"]
    assert db_session.query(Candidate).count() == 2
    assert db_session.query(CV).count() == 3

    # The member's dashboard batch holds all three; the admin's holds none.
    batch = client.get("/api/cvs/unattached", headers=member).json()
    assert [row["file_name"] for row in batch] == ["john.pdf", "jane-v2.pdf", "jane-v1.pdf"]
    assert client.get("/api/cvs/unattached", headers=admin).json() == []

    # 5. score the batch against the Job: Jane's two CVs collapse to one
    #    Application scored from the later CV.
    scored = client.post(
        "/api/jobs/{}/applications".format(job_id),
        json={"cv_ids": [first["cv_id"], second["cv_id"], third["cv_id"]]},
        headers=member,
    )
    assert scored.status_code == 201
    rows = {row["candidate_name"]: row for row in scored.json()}
    assert set(rows) == {"Jane Doe", "John Smith"}
    assert rows["Jane Doe"]["cv_id"] == second["cv_id"]
    assert rows["Jane Doe"]["match"]["overall_score"] == 100.0
    assert rows["Jane Doe"]["match"]["preferred_skills_matched"] == ["Docker"]
    assert rows["John Smith"]["match"]["overall_score"] == 50.0
    assert db_session.query(Application).count() == 2
    # Unattached is per CV: Jane's older CV, which no Application points
    # at, stays available to score elsewhere; the two scored CVs are gone.
    assert [row["file_name"] for row in client.get("/api/cvs/unattached", headers=member).json()] == ["jane-v1.pdf"]

    # 6. open the matches
    matches = client.get(f"/api/jobs/{job_id}/matches", headers=admin).json()
    assert matches["total_applications"] == 2
    assert [row["candidate_name"] for row in matches["applications"]] == ["Jane Doe", "John Smith"]
    assert [row["rank"] for row in matches["applications"]] == [1, 2]
    jane_application_id = matches["applications"][0]["application_id"]
    detail = client.get(f"/api/applications/{jane_application_id}/match", headers=admin).json()
    assert detail["overall_score"] == 100.0
    assert detail["cv_id"] == second["cv_id"]

    # 7. add Jane to a second Job, scored from her first (weaker) CV
    second_job = client.post(
        "/api/jobs",
        json={"title": "Data Engineer", "company_name": "Acme", "required_experience_years": 0, "skills": ["SQL"]},
        headers=admin,
    ).json()
    added = client.post(
        f"/api/candidates/{first['candidate_id']}/applications",
        json={"job_id": second_job["job_id"], "cv_id": first["cv_id"]},
        headers=admin,
    )
    assert added.status_code == 201
    assert added.json()["status"] == "created"
    assert added.json()["match"]["overall_score"] == 0.0

    # 8. the first Job's score did not move
    matches_again = client.get(f"/api/jobs/{job_id}/matches", headers=member).json()
    assert matches_again["applications"][0]["application_id"] == jane_application_id
    assert matches_again["applications"][0]["overall_score"] == 100.0
    detail_again = client.get(f"/api/applications/{jane_application_id}/match", headers=member).json()
    assert detail_again["overall_score"] == 100.0
    assert detail_again["cv_id"] == second["cv_id"]

    candidate = client.get(f"/api/candidates/{first['candidate_id']}", headers=member).json()
    assert {(a["job_title"], a["overall_score"]) for a in candidate["applications"]} == {
        ("Backend Developer", 100.0),
        ("Data Engineer", 0.0),
    }
    jobs = {row["title"]: row["applications_count"] for row in client.get("/api/jobs", headers=member).json()["jobs"]}
    assert jobs == {"Backend Developer": 2, "Data Engineer": 1}
    assert db_session.query(User).count() == 2

    # 9. compare the two candidates for the first Job. The gap is the one
    #    the ranking already showed, split across the Job's criteria.
    comparison = client.get(
        f"/api/comparisons?cv_a={second['cv_id']}&cv_b={third['cv_id']}&job_id={job_id}",
        headers=member,
    )
    assert comparison.status_code == 200
    body = comparison.json()
    assert body["winner"] == "a"
    assert (body["a"]["overall_score"], body["b"]["overall_score"]) == (100.0, 50.0)
    assert body["score_delta"] == 50.0
    assert [row["criterion"] for row in body["criteria"]] == ["skills"]
    assert body["criteria"][0]["contribution_delta"] == 50.0
    required = next(group for group in body["skill_groups"] if group["kind"] == "required")
    assert (required["both"], required["only_a"]) == (["SQL"], ["Python"])

    # Jane's own two CVs, with no Job: nothing is scored, the diff stands.
    versions = client.get(
        f"/api/comparisons?cv_a={second['cv_id']}&cv_b={first['cv_id']}", headers=member
    ).json()
    assert versions["mode"] == "profile"
    assert versions["winner"] is None
    assert versions["skill_groups"][0]["only_a"] == ["Docker", "SQL"]

    # Comparing changed nothing: no new Application, no new Match Result,
    # and the ranking reads exactly as it did before (ADR 0004).
    assert db_session.query(Application).count() == 3
    unchanged = client.get(f"/api/jobs/{job_id}/matches", headers=member).json()
    assert unchanged["applications"] == matches_again["applications"]
