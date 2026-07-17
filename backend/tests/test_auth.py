def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.get_json()
    assert data["success"] is True
    assert data["database"] == "connected"


def test_register_login_and_me(client):
    register = client.post(
        "/api/auth/register",
        json={
            "name": "Test User",
            "email": "test@example.com",
            "password": "password123",
        },
    )
    assert register.status_code == 201
    body = register.get_json()
    assert body["success"] is True
    assert body["data"]["email"] == "test@example.com"
    assert body["data"]["role"] == "customer"

    duplicate = client.post(
        "/api/auth/register",
        json={
            "name": "Other",
            "email": "test@example.com",
            "password": "password123",
        },
    )
    assert duplicate.status_code == 409

    login = client.post(
        "/api/auth/login",
        json={"email": "test@example.com", "password": "password123"},
    )
    assert login.status_code == 200
    token = login.get_json()["token"]
    assert token

    me = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me.status_code == 200
    me_body = me.get_json()
    assert me_body["data"]["email"] == "test@example.com"
    assert me_body["data"]["role"] == "customer"


def test_login_invalid_credentials(client):
    client.post(
        "/api/auth/register",
        json={
            "name": "Test User",
            "email": "test@example.com",
            "password": "password123",
        },
    )
    response = client.post(
        "/api/auth/login",
        json={"email": "test@example.com", "password": "wrong-password"},
    )
    assert response.status_code == 401


def test_register_validation(client):
    response = client.post(
        "/api/auth/register",
        json={"name": "A", "email": "not-an-email", "password": "short"},
    )
    assert response.status_code == 400
    assert response.get_json()["success"] is False


def test_me_requires_auth(client):
    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_register_integrity_error_returns_409(client, app, monkeypatch):
    """Simulate a race where unique email constraint fails on commit."""
    from sqlalchemy.exc import IntegrityError

    from app.extensions.db import db

    def boom():
        raise IntegrityError("INSERT", {}, Exception("unique email"))

    monkeypatch.setattr(db.session, "commit", boom)

    response = client.post(
        "/api/auth/register",
        json={
            "name": "Race User",
            "email": "race@example.com",
            "password": "password123",
        },
    )
    assert response.status_code == 409
    assert response.get_json()["message"] == "Email already exists"
