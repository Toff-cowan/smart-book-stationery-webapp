from decimal import Decimal

from werkzeug.security import generate_password_hash

from app.extensions.db import db
from app.models import Booklist, BooklistItem, Product, User


def _register_and_login(client, email="buyer@example.com"):
    client.post(
        "/api/auth/register",
        json={"name": "Buyer", "email": email, "password": "password123"},
    )
    login = client.post(
        "/api/auth/login",
        json={"email": email, "password": "password123"},
    )
    return login.get_json()["token"], login.get_json()["user"]["id"]


def test_bestsellers_ranked_by_completed_orders(client, app):
    with app.app_context():
        popular = Product(
            name="Top Seller Book",
            price=Decimal("10.00"),
            stock=50,
            department=Product.DEPARTMENT_TEXTBOOKS,
            is_active=True,
        )
        other = Product(
            name="Slow Seller Book",
            price=Decimal("8.00"),
            stock=50,
            department=Product.DEPARTMENT_TEXTBOOKS,
            is_active=True,
        )
        db.session.add_all([popular, other])
        db.session.flush()

        user = User(
            name="Buyer",
            email="rank@example.com",
            password_hash=generate_password_hash("password123"),
            role="customer",
        )
        db.session.add(user)
        db.session.flush()

        completed = Booklist(
            user_id=user.id,
            status=Booklist.STATUS_COMPLETED,
            title="Done order",
            fulfillment_type="pickup",
            grand_total=Decimal("30.00"),
        )
        ready = Booklist(
            user_id=user.id,
            status=Booklist.STATUS_READY,
            title="Ready order",
            fulfillment_type="pickup",
            grand_total=Decimal("10.00"),
        )
        draft = Booklist(
            user_id=user.id,
            status=Booklist.STATUS_DRAFT,
            title="Draft",
            grand_total=Decimal("100.00"),
        )
        db.session.add_all([completed, ready, draft])
        db.session.flush()

        db.session.add_all([
            BooklistItem(
                booklist_id=completed.id,
                product_id=popular.id,
                product_name=popular.name,
                quantity=2,
                unit_price=Decimal("10.00"),
                line_total=Decimal("20.00"),
            ),
            BooklistItem(
                booklist_id=ready.id,
                product_id=popular.id,
                product_name=popular.name,
                quantity=1,
                unit_price=Decimal("10.00"),
                line_total=Decimal("10.00"),
            ),
            BooklistItem(
                booklist_id=ready.id,
                product_id=other.id,
                product_name=other.name,
                quantity=1,
                unit_price=Decimal("8.00"),
                line_total=Decimal("8.00"),
            ),
            # Draft sales must not count
            BooklistItem(
                booklist_id=draft.id,
                product_id=other.id,
                product_name=other.name,
                quantity=99,
                unit_price=Decimal("8.00"),
                line_total=Decimal("792.00"),
            ),
        ])
        db.session.commit()
        popular_id = popular.id

    res = client.get("/api/inventory/bestsellers?limit=8")
    assert res.status_code == 200
    data = res.get_json()["data"]
    assert len(data) >= 2
    assert data[0]["id"] == popular_id
    assert data[0]["units_sold"] == 3
    assert data[0]["order_count"] == 2
    assert data[1]["units_sold"] == 1
