from datetime import UTC, datetime, timedelta

import jwt
from fastapi.testclient import TestClient

from app.core.config import get_settings

PREFIX = "/api/v1"
SCHEMA = "fir-report-intake"
PASSWORD = "test-user-password"


def create_user(client: TestClient, username: str = "reader") -> dict:
    response = client.post(
        f"{PREFIX}/auth/users", json={"username": username, "password": PASSWORD}
    )
    assert response.status_code == 201
    assert "password_hash" not in response.json()
    return response.json()


def login(client: TestClient, username: str) -> dict[str, str]:
    response = client.post(
        f"{PREFIX}/auth/token", data={"username": username, "password": PASSWORD}
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def grant(client: TestClient, user: dict, ids: list[str]) -> None:
    assert (
        client.put(
            f"{PREFIX}/auth/users/{user['id']}/schemas", json={"template_ids": ids}
        ).status_code
        == 200
    )


def test_login_and_invalid_tokens(client: TestClient):
    assert (
        client.post(
            f"{PREFIX}/auth/token", data={"username": "missing", "password": "bad"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            f"{PREFIX}/auth/token", data={"username": "admin", "password": "bad"}
        ).status_code
        == 401
    )
    settings = get_settings()
    assert settings.jwt_secret is not None
    now = datetime.now(UTC)
    user = client.get(f"{PREFIX}/auth/me").json()
    claims = {
        "sub": user["id"],
        "iss": settings.jwt_issuer,
        "iat": now - timedelta(hours=2),
        "exp": now - timedelta(hours=1),
    }
    for token in [
        "invalid",
        jwt.encode(claims, settings.jwt_secret.get_secret_value(), algorithm="HS256"),
        jwt.encode(
            {**claims, "exp": now + timedelta(hours=1), "iss": "another-app"},
            settings.jwt_secret.get_secret_value(),
            algorithm="HS256",
        ),
    ]:
        assert (
            client.get(
                f"{PREFIX}/auth/me", headers={"Authorization": f"Bearer {token}"}
            ).status_code
            == 401
        )
    client.headers.pop("Authorization")
    assert client.get(f"{PREFIX}/health").status_code == 200
    for path in [
        "/templates",
        "/cases",
        "/languages/config",
        "/cases/missing/artifacts/no/download",
    ]:
        assert client.get(PREFIX + path).status_code == 401


def test_schema_assignment_and_admin_restrictions(client: TestClient):
    user = create_user(client)
    headers = login(client, "READER")
    assert client.get(f"{PREFIX}/templates", headers=headers).json() == []
    assert (
        client.post(
            f"{PREFIX}/cases", json={"template_id": SCHEMA}, headers=headers
        ).status_code
        == 404
    )
    assert (
        client.post(f"{PREFIX}/templates", json={}, headers=headers).status_code == 403
    )
    assert client.get(f"{PREFIX}/auth/users", headers=headers).status_code == 403
    assert (
        client.put(
            f"{PREFIX}/auth/users/{user['id']}/schemas",
            json={"template_ids": [SCHEMA]},
            headers=headers,
        ).status_code
        == 403
    )
    grant(client, user, [SCHEMA])
    templates = client.get(f"{PREFIX}/templates", headers=headers).json()
    assert templates and {row["template_id"] for row in templates} == {SCHEMA}
    assert (
        client.get(f"{PREFIX}/templates/{SCHEMA}", headers=headers).status_code == 200
    )
    assert (
        client.put(
            f"{PREFIX}/templates/{SCHEMA}/versions/1", json={}, headers=headers
        ).status_code
        == 403
    )
    assert (
        client.delete(
            f"{PREFIX}/templates/{SCHEMA}/versions/1", headers=headers
        ).status_code
        == 403
    )
    assert (
        client.get(f"{PREFIX}/templates/medical-intake", headers=headers).status_code
        == 404
    )
    assert (
        client.put(
            f"{PREFIX}/auth/users/{user['id']}/schemas",
            json={"template_ids": ["missing"]},
        ).status_code
        == 422
    )
    assert client.get(f"{PREFIX}/auth/users/{user['id']}/schemas").json() == [SCHEMA]


CASE_ENDPOINTS = [
    ("GET", ""),
    ("DELETE", ""),
    ("PUT", "/title"),
    ("PUT", "/language"),
    ("GET", "/schema-state"),
    ("GET", "/evidence"),
    ("POST", "/evidence/text"),
    ("POST", "/evidence/upload"),
    ("GET", "/conversation/next-question"),
    ("GET", "/conversation/stream"),
    ("GET", "/conversation/turns"),
    ("POST", "/conversation/turns"),
    ("GET", "/validation"),
    ("GET", "/review"),
    ("POST", "/approve"),
    ("GET", "/artifacts"),
    ("POST", "/artifacts"),
    ("GET", "/artifacts/missing/download"),
    ("POST", "/fields/name/edit"),
    ("POST", "/fields/name/confirm"),
    ("POST", "/fields/name/reject"),
    ("POST", "/fields/reject-bulk"),
    ("POST", "/extract"),
    ("GET", "/jobs"),
    ("GET", "/candidates"),
]


def test_private_cases_and_revocation(client: TestClient):
    user, other = create_user(client), create_user(client, "other")
    grant(client, user, [SCHEMA])
    grant(client, other, [SCHEMA])
    owner, stranger = login(client, "reader"), login(client, "other")
    response = client.post(
        f"{PREFIX}/cases",
        headers=owner,
        json={"template_id": SCHEMA, "created_by": other["id"]},
    )
    assert response.status_code == 201
    case = response.json()
    assert case["created_by"] == user["id"]
    path = f"{PREFIX}/cases/{case['case_id']}"
    assert client.get(path, headers=owner).status_code == 200
    assert (
        client.get(f"{PREFIX}/cases", headers=owner).json()[0]["case_id"]
        == case["case_id"]
    )
    assert client.get(f"{PREFIX}/cases", headers=stranger).json() == []
    assert client.get(f"{PREFIX}/cases").json() == []
    # An admin also cannot inspect a user's case.
    assert client.get(path).status_code == 404
    for method, suffix in CASE_ENDPOINTS:
        response = client.request(method, path + suffix, headers=stranger)
        assert response.status_code == 404, (method, suffix, response.text)
    grant(client, user, [])
    assert client.get(f"{PREFIX}/cases", headers=owner).json() == []
    assert client.get(f"{PREFIX}/templates/{SCHEMA}", headers=owner).status_code == 404
    for method, suffix in CASE_ENDPOINTS:
        assert (
            client.request(method, path + suffix, headers=owner).status_code == 404
        ), (method, suffix)
    grant(client, user, [SCHEMA])
    assert client.get(path, headers=owner).status_code == 200


def test_disable_expiry_duplicates_and_admin_safety(client: TestClient):
    user = create_user(client)
    headers = login(client, "reader")
    assert (
        client.post(
            f"{PREFIX}/auth/users", json={"username": "READER", "password": PASSWORD}
        ).status_code
        == 409
    )
    assert (
        client.patch(
            f"{PREFIX}/auth/users/{user['id']}", json={"disabled": True}
        ).status_code
        == 200
    )
    assert client.get(f"{PREFIX}/auth/me", headers=headers).status_code == 401
    assert (
        client.post(
            f"{PREFIX}/auth/token", data={"username": "reader", "password": PASSWORD}
        ).status_code
        == 401
    )
    assert (
        client.patch(
            f"{PREFIX}/auth/users/{user['id']}",
            json={"disabled": False, "expires_at": "2020-01-01T00:00:00Z"},
        ).status_code
        == 200
    )
    assert client.get(f"{PREFIX}/auth/me", headers=headers).status_code == 401
    assert (
        client.post(
            f"{PREFIX}/auth/token", data={"username": "reader", "password": PASSWORD}
        ).status_code
        == 401
    )
    assert (
        client.patch(
            f"{PREFIX}/auth/users/{user['id']}",
            json={"disabled": False, "expires_at": "2020-01-01T00:00:00"},
        ).status_code
        == 422
    )
    admin = client.get(f"{PREFIX}/auth/me").json()
    assert (
        client.patch(
            f"{PREFIX}/auth/users/{admin['id']}", json={"disabled": True}
        ).status_code
        == 409
    )


def test_access_covers_all_versions(client: TestClient):
    user = create_user(client)
    grant(client, user, [SCHEMA])
    schema = client.get(f"{PREFIX}/templates/{SCHEMA}").json()
    schema["template_version"] = 99
    assert client.post(f"{PREFIX}/templates", json=schema).status_code == 201
    response = client.get(
        f"{PREFIX}/templates/{SCHEMA}?template_version=99",
        headers=login(client, "reader"),
    )
    assert response.status_code == 200
    assert response.json()["template_version"] == 99


def test_evidence_authorship_uses_session(client: TestClient):
    user = create_user(client)
    grant(client, user, [SCHEMA])
    headers = login(client, "reader")
    case = client.post(
        f"{PREFIX}/cases", headers=headers, json={"template_id": SCHEMA}
    ).json()
    path = f"{PREFIX}/cases/{case['case_id']}/evidence"
    response = client.post(
        path + "/text",
        headers=headers,
        json={"text": "Intake note", "created_by": "someone-else"},
    )
    assert response.status_code == 201
    evidence = client.get(path, headers=headers).json()
    assert evidence[0]["created_by"] == user["id"]


def test_deleting_last_schema_version_clears_assignments(client: TestClient):
    user = create_user(client)
    schema = client.get(f"{PREFIX}/templates/{SCHEMA}").json()
    schema["template_id"] = "temporary-auth-test"
    schema["template_version"] = 1
    assert client.post(f"{PREFIX}/templates", json=schema).status_code == 201
    schema["template_version"] = 2
    assert client.post(f"{PREFIX}/templates", json=schema).status_code == 201
    grant(client, user, [schema["template_id"]])
    assert (
        client.delete(
            f"{PREFIX}/templates/{schema['template_id']}/versions/1"
        ).status_code
        == 204
    )
    assert client.get(f"{PREFIX}/auth/users/{user['id']}/schemas").json() == [
        schema["template_id"]
    ]
    assert (
        client.delete(
            f"{PREFIX}/templates/{schema['template_id']}/versions/2"
        ).status_code
        == 204
    )
    assert client.get(f"{PREFIX}/auth/users/{user['id']}/schemas").json() == []
