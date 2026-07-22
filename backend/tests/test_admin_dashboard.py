from decimal import Decimal

from werkzeug.security import generate_password_hash

from app.extensions.db import db
from app.models import Booklist, BooklistItem, Product, User


def _login(client, email, password="password123"):
    res = client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )
    return res.get_json()["token"]


def _seed_admin_and_order(app):
    with app.app_context():
        admin = User(
            name="Admin",
            email="dash-admin@example.com",
            password_hash=generate_password_hash("password123"),
            role="owner",
        )
        customer = User(
            name="Shopper",
            email="dash-shopper@example.com",
            password_hash=generate_password_hash("password123"),
            role="customer",
        )
        product = Product(
            name="Dash Book",
            price=Decimal("12.50"),
            stock=5,
            department=Product.DEPARTMENT_TEXTBOOKS,
            is_active=True,
        )
        db.session.add_all([admin, customer, product])
        db.session.flush()
        order = Booklist(
            user_id=customer.id,
            status=Booklist.STATUS_SUBMITTED,
            fulfillment_type=Booklist.FULFILLMENT_PICKUP,
            title="Cart request",
            grand_total=Decimal("25.00"),
        )
        db.session.add(order)
        db.session.flush()
        db.session.add(
            BooklistItem(
                booklist_id=order.id,
                product_id=product.id,
                product_name=product.name,
                quantity=2,
                unit_price=product.price,
                line_total=Decimal("25.00"),
            )
        )
        from datetime import datetime, timezone

        order.submitted_at = datetime.now(timezone.utc)
        db.session.commit()
        return order.id, customer.id


def test_admin_orders_summary_sales_and_notify(client, app):
    order_id, _ = _seed_admin_and_order(app)
    token = _login(client, "dash-admin@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    listed = client.get("/api/admin/orders?bucket=outstanding", headers=headers)
    assert listed.status_code == 200
    rows = listed.get_json()["data"]
    assert any(row["id"] == order_id for row in rows)
    row = next(r for r in rows if r["id"] == order_id)
    assert row["customer"]["email"] == "dash-shopper@example.com"
    assert row["item_count"] == 2

    detail = client.get(f"/api/admin/orders/{order_id}", headers=headers)
    assert detail.status_code == 200
    assert detail.get_json()["data"]["items"][0]["product_name"] == "Dash Book"

    summary = client.get("/api/admin/stats/summary", headers=headers)
    assert summary.status_code == 200
    assert summary.get_json()["data"]["outstanding"] >= 1

    sales = client.get("/api/admin/stats/sales?days=7", headers=headers)
    assert sales.status_code == 200
    assert len(sales.get_json()["data"]) == 7

    notify = client.post(
        f"/api/admin/orders/{order_id}/notify",
        headers=headers,
        json={
            "message": "We have both books in stock.",
            "confirmed_total": "25.00",
            "ready_at": "Friday 3pm",
        },
    )
    assert notify.status_code == 200
    assert "Customer notified" in notify.get_json()["message"]

    status = client.patch(
        f"/api/admin/orders/{order_id}/status",
        headers=headers,
        json={"status": "ready"},
    )
    assert status.status_code == 200
    assert status.get_json()["data"]["status"] == "ready"

    customer_token = _login(client, "dash-shopper@example.com")
    customer_headers = {"Authorization": f"Bearer {customer_token}"}
    notifs = client.get("/api/notifications", headers=customer_headers)
    assert notifs.status_code == 200
    notes = notifs.get_json()["data"]
    assert any(n["type"] == "order_status" for n in notes)
    assert any("ready" in (n["body"] or "").lower() for n in notes)
