"""Login, the current user, password change, the admin-only user endpoints
and the guard that puts every other route behind login (W1.2–W1.5).

These use `anon_client`, which does not override `get_current_user`, so the
real Bearer check runs.
"""

from datetime import datetime, timedelta, timezone

import pytest

import main
from models.user import ROLE_ADMIN, ROLE_MEMBER, User
from services import auth
from services.auth import TokenError, create_access_token, decode_access_token, hash_password, verify_password
from tests.conftest import TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, TEST_MEMBER_EMAIL


def login(client, email, password=TEST_ADMIN_PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def bearer(client, email, password=TEST_ADMIN_PASSWORD):
    response = login(client, email, password)
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


# --- services/auth ---------------------------------------------------------


def test_password_round_trip():
    hashed = hash_password("correct horse")
    assert verify_password("correct horse", hashed)
    assert not verify_password("wrong", hashed)
    assert not verify_password("anything", "not-a-hash")


def test_token_round_trip(user):
    token = create_access_token(user)
    assert decode_access_token(token) == user.id


def test_expired_token_is_rejected(user):
    issued = datetime.now(timezone.utc) - auth.TOKEN_LIFETIME - timedelta(minutes=1)
    token = create_access_token(user, now=issued)
    with pytest.raises(TokenError):
        decode_access_token(token)


def test_tampered_and_malformed_tokens_are_rejected(user, monkeypatch):
    token = create_access_token(user)
    header, payload, signature = token.split(".")
    with pytest.raises(TokenError):
        decode_access_token(f"{header}.{payload}.{signature[:-2]}xx")
    with pytest.raises(TokenError):
        decode_access_token("garbage")
    monkeypatch.setenv("JWT_SECRET", "another-secret")
    with pytest.raises(TokenError):
        decode_access_token(token)


# --- the route walk (W1.4) -------------------------------------------------


def test_every_route_except_health_and_login_requires_a_token(anon_client):
    """Enumerate app.routes, call each without a token, and assert 401 for
    everything not in the allowlist, so a new route cannot be forgotten."""
    # The OpenAPI document is the flattened, prefixed list of every operation,
    # whatever FastAPI's internal route nesting looks like.
    checked = []
    for path, operations in main.app.openapi()["paths"].items():
        for method in (m.upper() for m in operations):
            concrete = path.replace("{job_id}", "1").replace("{cv_id}", "1")
            concrete = concrete.replace("{candidate_id}", "1").replace("{application_id}", "1")
            concrete = concrete.replace("{user_id}", "1")
            response = anon_client.request(method, concrete)
            checked.append((method, path))
            if (method, path) in main.OPEN_ROUTES:
                assert response.status_code != 401, (method, path)
            else:
                assert response.status_code == 401, (method, path, response.status_code)
    assert ("GET", "/api/jobs") in checked
    assert ("POST", "/api/cv/upload") in checked
    assert ("GET", "/api/cvs/unattached") in checked
    assert ("GET", "/api/candidates") in checked
    assert ("GET", "/api/applications/{application_id}/match") in checked
    assert ("GET", "/api/users") in checked


# --- login / me / change-password ------------------------------------------


def test_login_returns_token_and_user_and_records_last_login(anon_client, db_session, user):
    assert user.last_login_at is None
    response = login(anon_client, "  TESTS@example.com ")

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["email"] == TEST_ADMIN_EMAIL
    assert body["user"]["role"] == ROLE_ADMIN
    assert "password_hash" not in body["user"]
    assert decode_access_token(body["token"]) == user.id
    db_session.refresh(user)
    assert user.last_login_at is not None


def test_login_failures_share_one_message(anon_client, db_session, user, member):
    wrong = login(anon_client, TEST_ADMIN_EMAIL, "nope")
    unknown = login(anon_client, "nobody@example.com")
    member.is_active = False
    db_session.commit()
    inactive = login(anon_client, TEST_MEMBER_EMAIL)

    assert wrong.status_code == unknown.status_code == inactive.status_code == 401
    assert wrong.json()["detail"] == unknown.json()["detail"] == inactive.json()["detail"]


def test_me_returns_the_current_user(anon_client, user):
    response = anon_client.get("/api/auth/me", headers=bearer(anon_client, TEST_ADMIN_EMAIL))
    assert response.status_code == 200
    assert response.json()["id"] == user.id


def test_deactivation_is_immediate_despite_a_valid_token(anon_client, db_session, member):
    headers = bearer(anon_client, TEST_MEMBER_EMAIL)
    assert anon_client.get("/api/auth/me", headers=headers).status_code == 200

    member.is_active = False
    db_session.commit()

    assert anon_client.get("/api/auth/me", headers=headers).status_code == 401


def test_change_password(anon_client, db_session, member):
    member.must_change_password = True
    db_session.commit()
    headers = bearer(anon_client, TEST_MEMBER_EMAIL)

    wrong = anon_client.post(
        "/api/auth/change-password",
        json={"current_password": "nope", "new_password": "newpassword1"},
        headers=headers,
    )
    assert wrong.status_code == 400

    short = anon_client.post(
        "/api/auth/change-password",
        json={"current_password": TEST_ADMIN_PASSWORD, "new_password": "short"},
        headers=headers,
    )
    assert short.status_code == 422

    ok = anon_client.post(
        "/api/auth/change-password",
        json={"current_password": TEST_ADMIN_PASSWORD, "new_password": "newpassword1"},
        headers=headers,
    )
    assert ok.status_code == 200
    assert ok.json()["must_change_password"] is False
    assert login(anon_client, TEST_MEMBER_EMAIL, "newpassword1").status_code == 200
    assert login(anon_client, TEST_MEMBER_EMAIL, TEST_ADMIN_PASSWORD).status_code == 401


# --- /api/users (admin only) ------------------------------------------------


def test_users_endpoints_are_forbidden_for_members(anon_client, member, user):
    headers = bearer(anon_client, TEST_MEMBER_EMAIL)
    payload = {"email": "new@example.com", "full_name": "New", "role": ROLE_MEMBER, "temporary_password": "temporary1"}

    assert anon_client.get("/api/users", headers=headers).status_code == 403
    assert anon_client.post("/api/users", json=payload, headers=headers).status_code == 403
    assert anon_client.patch(f"/api/users/{user.id}", json={"full_name": "X"}, headers=headers).status_code == 403
    assert (
        anon_client.post(
            f"/api/users/{user.id}/reset-password", json={"temporary_password": "temporary1"}, headers=headers
        ).status_code
        == 403
    )


def test_admin_creates_a_user_who_must_change_password(anon_client, db_session, user):
    headers = bearer(anon_client, TEST_ADMIN_EMAIL)
    payload = {"email": " New@Example.com ", "full_name": " New Person ", "role": ROLE_MEMBER, "temporary_password": "temporary1"}

    response = anon_client.post("/api/users", json=payload, headers=headers)

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "new@example.com"
    assert body["full_name"] == "New Person"
    assert body["must_change_password"] is True
    assert body["is_active"] is True

    duplicate = anon_client.post("/api/users", json=payload, headers=headers)
    assert duplicate.status_code == 409

    first_login = login(anon_client, "new@example.com", "temporary1")
    assert first_login.status_code == 200
    assert first_login.json()["user"]["must_change_password"] is True

    listed = anon_client.get("/api/users", headers=headers).json()
    assert {row["email"] for row in listed} == {TEST_ADMIN_EMAIL, "new@example.com"}


def test_create_user_validation(anon_client, user):
    headers = bearer(anon_client, TEST_ADMIN_EMAIL)
    base = {"email": "new@example.com", "full_name": "New", "role": ROLE_MEMBER, "temporary_password": "temporary1"}

    assert anon_client.post("/api/users", json={**base, "role": "owner"}, headers=headers).status_code == 422
    assert anon_client.post("/api/users", json={**base, "email": "not-an-email"}, headers=headers).status_code == 422
    assert anon_client.post("/api/users", json={**base, "temporary_password": "short"}, headers=headers).status_code == 422


def test_admin_updates_role_name_and_status(anon_client, db_session, user, member):
    headers = bearer(anon_client, TEST_ADMIN_EMAIL)

    response = anon_client.patch(
        f"/api/users/{member.id}", json={"full_name": "Renamed", "role": ROLE_ADMIN}, headers=headers
    )
    assert response.status_code == 200
    assert response.json()["full_name"] == "Renamed"
    assert response.json()["role"] == ROLE_ADMIN

    deactivated = anon_client.patch(f"/api/users/{member.id}", json={"is_active": False}, headers=headers)
    assert deactivated.status_code == 200
    assert deactivated.json()["is_active"] is False
    assert login(anon_client, TEST_MEMBER_EMAIL).status_code == 401

    assert anon_client.patch("/api/users/999", json={"is_active": False}, headers=headers).status_code == 404


def test_admin_cannot_deactivate_or_demote_themself(anon_client, user, member):
    headers = bearer(anon_client, TEST_ADMIN_EMAIL)
    assert anon_client.patch(f"/api/users/{user.id}", json={"is_active": False}, headers=headers).status_code == 409
    assert anon_client.patch(f"/api/users/{user.id}", json={"role": ROLE_MEMBER}, headers=headers).status_code == 409
    # Renaming yourself is fine.
    assert anon_client.patch(f"/api/users/{user.id}", json={"full_name": "Me"}, headers=headers).status_code == 200


def test_last_active_admin_is_protected(anon_client, db_session, user, member):
    """A second Admin may demote or deactivate the first only while another
    active Admin remains."""
    member.role = ROLE_ADMIN
    db_session.commit()
    as_member_admin = bearer(anon_client, TEST_MEMBER_EMAIL)

    # Two active admins: demoting the other one is allowed.
    demoted = anon_client.patch(f"/api/users/{user.id}", json={"role": ROLE_MEMBER}, headers=as_member_admin)
    assert demoted.status_code == 200

    # Now the acting user is the last active Admin: nobody can deactivate or
    # demote them, and they cannot do it to themself either.
    as_original = bearer(anon_client, TEST_ADMIN_EMAIL)  # now a member
    assert anon_client.patch(f"/api/users/{member.id}", json={"is_active": False}, headers=as_original).status_code == 403
    assert anon_client.patch(f"/api/users/{member.id}", json={"is_active": False}, headers=as_member_admin).status_code == 409

    # Promote the original back, then deactivating the other admin works.
    assert anon_client.patch(f"/api/users/{user.id}", json={"role": ROLE_ADMIN}, headers=as_member_admin).status_code == 200
    as_original = bearer(anon_client, TEST_ADMIN_EMAIL)
    assert anon_client.patch(f"/api/users/{member.id}", json={"is_active": False}, headers=as_original).status_code == 200
    assert db_session.query(User).filter(User.role == ROLE_ADMIN, User.is_active.is_(True)).count() == 1


def test_reset_password_sets_a_temporary_one(anon_client, db_session, user, member):
    headers = bearer(anon_client, TEST_ADMIN_EMAIL)

    response = anon_client.post(
        f"/api/users/{member.id}/reset-password", json={"temporary_password": "temporary1"}, headers=headers
    )

    assert response.status_code == 200
    assert response.json()["must_change_password"] is True
    assert login(anon_client, TEST_MEMBER_EMAIL, TEST_ADMIN_PASSWORD).status_code == 401
    assert login(anon_client, TEST_MEMBER_EMAIL, "temporary1").status_code == 200
    assert anon_client.post("/api/users/999/reset-password", json={"temporary_password": "temporary1"}, headers=headers).status_code == 404


def test_users_are_never_deleted(anon_client, user):
    headers = bearer(anon_client, TEST_ADMIN_EMAIL)
    assert anon_client.delete(f"/api/users/{user.id}", headers=headers).status_code == 405
