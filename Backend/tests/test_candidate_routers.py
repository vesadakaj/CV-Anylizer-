"""HTTP-layer tests for the Candidates list and detail endpoints (W2.12)."""

from datetime import datetime

from services.applications import create_or_update_applications
from tests.factories import add_job_skill, make_candidate, make_candidate_with_cv, make_cv, make_job


def test_list_empty(client):
    body = client.get("/api/candidates").json()
    assert body == {"candidates": [], "total": 0, "limit": 50, "offset": 0, "search": None}


def test_list_counts_cvs_and_applications(client, db_session, user):
    job = make_job(db_session, user, "Backend")
    add_job_skill(db_session, job, "Python", required=True)
    jane, jane_cv = make_candidate_with_cv(db_session, user, "Jane Doe", email="jane@x.com", file_name="jane1.pdf")
    make_cv(db_session, jane, user, file_name="jane2.pdf")
    _, _ = make_candidate_with_cv(db_session, user, "Nobody Yet")
    no_cv = make_candidate(db_session, "No CV")
    db_session.commit()
    create_or_update_applications(db_session, job.id, [jane_cv.id], user)

    body = client.get("/api/candidates").json()

    assert body["total"] == 3
    by_name = {row["full_name"]: row for row in body["candidates"]}
    assert by_name["Jane Doe"]["cv_count"] == 2
    assert by_name["Jane Doe"]["application_count"] == 1
    assert by_name["Jane Doe"]["linkable"] is True
    assert by_name["Jane Doe"]["email"] == "jane@x.com"
    assert by_name["Nobody Yet"]["application_count"] == 0
    assert by_name["Nobody Yet"]["linkable"] is False
    assert by_name["No CV"]["cv_count"] == 0
    assert by_name["No CV"]["last_uploaded_at"] is None
    assert by_name["No CV"]["id"] == no_cv.id


def test_list_orders_by_last_upload_desc(client, db_session, user):
    old, old_cv = make_candidate_with_cv(db_session, user, "Old")
    old_cv.uploaded_at = datetime(2026, 1, 1)
    new, new_cv = make_candidate_with_cv(db_session, user, "New")
    new_cv.uploaded_at = datetime(2026, 2, 1)
    db_session.commit()

    names = [row["full_name"] for row in client.get("/api/candidates").json()["candidates"]]
    assert names == ["New", "Old"]


def test_list_search_matches_name_or_email(client, db_session, user):
    make_candidate_with_cv(db_session, user, "Jane Doe", email="jane@x.com")
    make_candidate_with_cv(db_session, user, "John Smith", email="john@acme.com")
    db_session.commit()

    assert [r["full_name"] for r in client.get("/api/candidates", params={"search": "doe"}).json()["candidates"]] == ["Jane Doe"]
    assert [r["full_name"] for r in client.get("/api/candidates", params={"search": "ACME"}).json()["candidates"]] == ["John Smith"]
    body = client.get("/api/candidates", params={"search": "nobody"}).json()
    assert body["candidates"] == []
    assert body["total"] == 0
    assert body["search"] == "nobody"


def test_list_paginates(client, db_session, user):
    for i in range(3):
        make_candidate_with_cv(db_session, user, f"Candidate {i}")
    db_session.commit()

    page = client.get("/api/candidates", params={"limit": 2, "offset": 2}).json()
    assert page["total"] == 3
    assert len(page["candidates"]) == 1
    assert page["limit"] == 2
    assert page["offset"] == 2


def test_list_rejects_bad_paging(client):
    assert client.get("/api/candidates", params={"limit": 0}).status_code == 422
    assert client.get("/api/candidates", params={"limit": 500}).status_code == 422
    assert client.get("/api/candidates", params={"offset": -1}).status_code == 422


def test_detail_lists_cvs_and_applications(client, db_session, user):
    job = make_job(db_session, user, "Backend")
    add_job_skill(db_session, job, "Python", required=True)
    unscorable_job = make_job(db_session, user, "Vague", required_experience_years=None, required_education=None)
    jane, old_cv = make_candidate_with_cv(db_session, user, "Jane Doe", email="jane@x.com", file_name="old.pdf")
    old_cv.uploaded_at = datetime(2026, 1, 1)
    new_cv = make_cv(db_session, jane, user, file_name="new.pdf")
    new_cv.uploaded_at = datetime(2026, 2, 1)
    jane.phone = "123"
    db_session.commit()
    create_or_update_applications(db_session, job.id, [old_cv.id], user)
    create_or_update_applications(db_session, unscorable_job.id, [new_cv.id], user)

    body = client.get(f"/api/candidates/{jane.id}").json()

    assert body["full_name"] == "Jane Doe"
    assert body["email"] == "jane@x.com"
    assert body["phone"] == "123"
    assert body["linkable"] is True
    assert [cv["file_name"] for cv in body["cvs"]] == ["new.pdf", "old.pdf"]
    assert body["cvs"][0]["uploaded_by"] == "Test Admin"
    by_job = {application["job_title"]: application for application in body["applications"]}
    assert by_job["Backend"]["status"] == "scored"
    assert by_job["Backend"]["overall_score"] == 0.0
    assert by_job["Backend"]["cv_id"] == old_cv.id
    assert by_job["Backend"]["job_id"] == job.id
    assert by_job["Vague"]["status"] == "unscorable"
    assert by_job["Vague"]["overall_score"] is None


def test_detail_of_unattached_candidate(client, db_session, user):
    candidate, _ = make_candidate_with_cv(db_session, user, "Alone")
    db_session.commit()

    body = client.get(f"/api/candidates/{candidate.id}").json()
    assert body["applications"] == []
    assert body["linkable"] is False


def test_detail_not_found_returns_404(client):
    assert client.get("/api/candidates/999").status_code == 404
