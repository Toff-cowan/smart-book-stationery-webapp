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
        json={"fulfillment_type": "pickup", "notes": "After 3pm"},
    )
    assert checkout.status_code == 201
    order = checkout.get_json()["data"]
    assert order["status"] == "submitted"
    assert order["fulfillment_type"] == "pickup"

    orders = client.get("/api/booklists/orders", headers=headers)
    assert orders.status_code == 200
    assert len(orders.get_json()["data"]) == 1

    order_id = order["id"]
    detail = client.get(f"/api/booklists/orders/{order_id}", headers=headers)
    assert detail.status_code == 200
    assert detail.get_json()["data"]["status"] == "submitted"


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
