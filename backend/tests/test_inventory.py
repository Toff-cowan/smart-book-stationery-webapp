from decimal import Decimal

from werkzeug.security import generate_password_hash

from app.extensions.db import db
from app.models import Product, User


def _register_and_login(client, email="shopper@example.com"):
    client.post(
        "/api/auth/register",
        json={"name": "Shopper", "email": email, "password": "password123"},
    )
    login = client.post(
        "/api/auth/login",
        json={"email": email, "password": "password123"},
    )
    return login.get_json()["token"]


def _make_admin(app, email="admin@example.com", password="password123"):
    with app.app_context():
        admin = User(
            name="Admin",
            email=email,
            password_hash=generate_password_hash(password),
            role="admin",
        )
        db.session.add(admin)
        db.session.commit()
    login = app.test_client().post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )
    return login.get_json()["token"]


def _seed_inventory_item(app, **overrides):
    with app.app_context():
        data = {
            "name": "Test Textbook",
            "description": "A book",
            "price": Decimal("20.00"),
            "stock": 10,
            "department": Product.DEPARTMENT_TEXTBOOKS,
            "author": "Jane Doe",
            "publisher": "EduPress",
            "is_active": True,
        }
        data.update(overrides)
        product = Product(**data)
        db.session.add(product)
        db.session.commit()
        return product.id


def test_public_inventory_list_and_detail(client, app):
    item_id = _seed_inventory_item(app)

    listed = client.get("/api/inventory")
    assert listed.status_code == 200
    body = listed.get_json()
    assert body["pagination"]["total"] == 1
    item = body["data"][0]
    assert item["quantity"] == 10
    assert item["department"] == "textbooks"
    assert item["author"] == "Jane Doe"
    assert item["publisher"] == "EduPress"
    assert item["rating_stars"] is None
    assert item["rating_count"] == 0

    filtered = client.get("/api/inventory?department=textbooks")
    assert filtered.status_code == 200
    assert len(filtered.get_json()["data"]) == 1

    bad_dept = client.get("/api/inventory?department=toys")
    assert bad_dept.status_code == 400

    detail = client.get(f"/api/inventory/{item_id}")
    assert detail.status_code == 200
    assert detail.get_json()["data"]["name"] == "Test Textbook"


def test_customer_cannot_mutate_inventory(client, app):
    item_id = _seed_inventory_item(app)
    token = _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    create = client.post(
        "/api/admin/inventory",
        headers=headers,
        json={
            "name": "Forbidden",
            "price": 1,
            "quantity": 1,
            "department": "stationery",
        },
    )
    assert create.status_code == 403

    update = client.patch(
        f"/api/admin/inventory/{item_id}",
        headers=headers,
        json={"quantity": 99},
    )
    assert update.status_code == 403

    delete = client.delete(
        f"/api/admin/inventory/{item_id}",
        headers=headers,
    )
    assert delete.status_code == 403


def test_admin_inventory_crud(client, app):
    admin_token = _make_admin(app)
    headers = {"Authorization": f"Bearer {admin_token}"}

    create = client.post(
        "/api/admin/inventory",
        headers=headers,
        json={
            "name": "Gift Mug",
            "price": "12.50",
            "quantity": 40,
            "department": "gifts",
            "description": "Ceramic mug",
        },
    )
    assert create.status_code == 201
    created = create.get_json()["data"]
    assert created["department"] == "gifts"
    assert created["quantity"] == 40
    item_id = created["id"]

    update = client.patch(
        f"/api/admin/inventory/{item_id}",
        headers=headers,
        json={"quantity": 35, "department": "stationery"},
    )
    assert update.status_code == 200
    updated = update.get_json()["data"]
    assert updated["quantity"] == 35
    assert updated["department"] == "stationery"
    assert updated["stock"] == 35

    admin_list = client.get("/api/admin/inventory", headers=headers)
    assert admin_list.status_code == 200
    assert any(i["id"] == item_id for i in admin_list.get_json()["data"])

    delete = client.delete(f"/api/admin/inventory/{item_id}", headers=headers)
    assert delete.status_code == 200
    assert delete.get_json()["data"]["is_active"] is False

    public = client.get(f"/api/inventory/{item_id}")
    assert public.status_code == 404


def test_inventory_validation(client, app):
    admin_token = _make_admin(app, email="admin2@example.com")
    headers = {"Authorization": f"Bearer {admin_token}"}

    bad_dept = client.post(
        "/api/admin/inventory",
        headers=headers,
        json={
            "name": "Bad",
            "price": 1,
            "quantity": 1,
            "department": "toys",
        },
    )
    assert bad_dept.status_code == 400


def test_customer_can_rate_products(client, app):
    item_id = _seed_inventory_item(app)
    token = _register_and_login(client, email="rater@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    unauth = client.post(
        f"/api/inventory/{item_id}/ratings",
        json={"stars": 5},
    )
    assert unauth.status_code == 401

    bad = client.post(
        f"/api/inventory/{item_id}/ratings",
        headers=headers,
        json={"stars": 6},
    )
    assert bad.status_code == 400

    create = client.post(
        f"/api/inventory/{item_id}/ratings",
        headers=headers,
        json={"stars": 5},
    )
    assert create.status_code == 201
    assert create.get_json()["data"]["stars"] == 5
    assert create.get_json()["product"]["rating_stars"] == 5.0
    assert create.get_json()["product"]["rating_count"] == 1

    update = client.post(
        f"/api/inventory/{item_id}/ratings",
        headers=headers,
        json={"stars": 3},
    )
    assert update.status_code == 200
    assert update.get_json()["data"]["stars"] == 3
    assert update.get_json()["product"]["rating_stars"] == 3.0

    token2 = _register_and_login(client, email="rater2@example.com")
    client.post(
        f"/api/inventory/{item_id}/ratings",
        headers={"Authorization": f"Bearer {token2}"},
        json={"stars": 5},
    )

    listed = client.get(f"/api/inventory/{item_id}/ratings")
    assert listed.status_code == 200
    body = listed.get_json()
    assert len(body["data"]) == 2
    assert body["summary"]["rating_count"] == 2
    assert body["summary"]["rating_stars"] == 4.0

    delete = client.delete(
        f"/api/inventory/{item_id}/ratings",
        headers=headers,
    )
    assert delete.status_code == 200
    assert delete.get_json()["product"]["rating_count"] == 1
    assert delete.get_json()["product"]["rating_stars"] == 5.0
