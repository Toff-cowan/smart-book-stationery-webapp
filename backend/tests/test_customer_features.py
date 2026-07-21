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


def _seed_product(app):
    from decimal import Decimal

    from app.extensions.db import db
    from app.models import Category, Product

    with app.app_context():
        cat = Category(name="Books", description="Test")
        db.session.add(cat)
        db.session.flush()
        product = Product(
            name="Test Textbook",
            description="A book",
            price=Decimal("20.00"),
            stock=10,
            category_id=cat.id,
            is_active=True,
        )
        db.session.add(product)
        db.session.commit()
        return product.id, cat.id


def test_browse_search_filter_products(client, app):
    product_id, category_id = _seed_product(app)

    listed = client.get("/api/products")
    assert listed.status_code == 200
    assert listed.get_json()["pagination"]["total"] == 1

    searched = client.get("/api/products?q=Textbook")
    assert searched.status_code == 200
    assert len(searched.get_json()["data"]) == 1

    filtered = client.get(f"/api/products?category_id={category_id}")
    assert filtered.status_code == 200
    assert filtered.get_json()["data"][0]["id"] == product_id

    detail = client.get(f"/api/products/{product_id}")
    assert detail.status_code == 200
    assert detail.get_json()["data"]["name"] == "Test Textbook"

    cats = client.get("/api/products/categories")
    assert cats.status_code == 200
    assert len(cats.get_json()["data"]) == 1


def test_cart_checkout_and_orders(client, app):
    product_id, _ = _seed_product(app)
    token = _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    add = client.post(
        "/api/cart/items",
        headers=headers,
        json={"product_id": product_id, "quantity": 2},
    )
    assert add.status_code == 200
    cart = add.get_json()["data"]
    assert cart["grand_total"] == 40.0
    assert len(cart["items"]) == 1

    checkout = client.post(
        "/api/cart/checkout",
        headers=headers,
        json={
            "fulfillment_type": "pickup",
            "notes": "After 3pm",
            "contact_email": "buyer@example.com",
            "contact_phone": "876-555-0100",
        },
    )
    assert checkout.status_code == 201
    body = checkout.get_json()
    order = body["data"]
    assert order["status"] == "submitted"
    assert order["fulfillment_type"] == "pickup"
    assert order["contact_email"] == "buyer@example.com"
    assert order["contact_phone"] == "876-555-0100"
    assert "bookstore" in (body.get("message") or "").lower()
    assert cart["items"][0].get("image_url") is not None or "image_url" in cart["items"][0]

    orders = client.get("/api/booklists/orders", headers=headers)
    assert orders.status_code == 200
    assert len(orders.get_json()["data"]) == 1

    order_id = order["id"]
    detail = client.get(f"/api/booklists/orders/{order_id}", headers=headers)
    assert detail.status_code == 200
    assert detail.get_json()["data"]["status"] == "submitted"


def test_customer_delete_order_notifies_admin(client, app):
    from werkzeug.security import generate_password_hash

    from app.extensions.db import db
    from app.models import Notification, User

    product_id, _ = _seed_product(app)
    with app.app_context():
        db.session.add(
            User(
                name="Admin",
                email="notify-admin@example.com",
                password_hash=generate_password_hash("password123"),
                role="admin",
            )
        )
        db.session.commit()

    token = _register_and_login(client, email="deleter@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    client.post(
        "/api/cart/items",
        headers=headers,
        json={"product_id": product_id, "quantity": 1},
    )
    checkout = client.post(
        "/api/cart/checkout",
        headers=headers,
        json={
            "fulfillment_type": "pickup",
            "contact_email": "deleter@example.com",
            "contact_phone": "876-555-9999",
        },
    )
    assert checkout.status_code == 201
    order_id = checkout.get_json()["data"]["id"]

    deleted = client.delete(
        f"/api/booklists/orders/{order_id}",
        headers=headers,
    )
    assert deleted.status_code == 200
    body = deleted.get_json()
    assert body["data"]["status"] == "cancelled"
    assert "bookstore" in (body.get("message") or "").lower()

    again = client.delete(
        f"/api/booklists/orders/{order_id}",
        headers=headers,
    )
    assert again.status_code == 400

    with app.app_context():
        notes = Notification.query.filter_by(type="order_cancelled").all()
        assert len(notes) == 1
        assert notes[0].booklist_id == order_id
        assert "deleted" in notes[0].title.lower()

    admin_login = client.post(
        "/api/auth/login",
        json={"email": "notify-admin@example.com", "password": "password123"},
    )
    admin_headers = {
        "Authorization": f"Bearer {admin_login.get_json()['token']}"
    }
    notifs = client.get("/api/notifications", headers=admin_headers)
    assert notifs.status_code == 200
    assert any(n["type"] == "order_cancelled" for n in notifs.get_json()["data"])

    cancelled = client.get(
        "/api/admin/orders?bucket=cancelled",
        headers=admin_headers,
    )
    assert cancelled.status_code == 200
    assert any(row["id"] == order_id for row in cancelled.get_json()["data"])


def test_share_booklist_and_message(client, app):
    product_id, _ = _seed_product(app)
    token = _register_and_login(client, email="share@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    client.post(
        "/api/cart/items",
        headers=headers,
        json={"product_id": product_id, "quantity": 1},
    )
    cart = client.get("/api/cart", headers=headers).get_json()["data"]

    share = client.post(f"/api/booklists/{cart['id']}/share", headers=headers)
    assert share.status_code == 200
    token_share = share.get_json()["data"]["share_token"]

    public = client.get(f"/api/booklists/shared/{token_share}")
    assert public.status_code == 200
    assert public.get_json()["data"]["id"] == cart["id"]

    msg = client.post(
        "/api/messages",
        headers=headers,
        json={"body": "Do you have this in stock?"},
    )
    assert msg.status_code == 201

    thread = client.get("/api/messages", headers=headers)
    assert thread.status_code == 200
    assert len(thread.get_json()["data"]) == 1
