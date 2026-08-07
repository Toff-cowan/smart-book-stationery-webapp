"""Landing new-releases and customer-choice recommendations."""

from decimal import Decimal
from datetime import datetime, timedelta, timezone

from werkzeug.security import generate_password_hash

from app.extensions.db import db
from app.models import Booklist, BooklistItem, Product, User


def test_new_releases_prefer_recent_textbooks(client, app):
    with app.app_context():
        older = Product(
            name="Older Textbook",
            price=Decimal("10.00"),
            stock=5,
            department=Product.DEPARTMENT_TEXTBOOKS,
            is_active=True,
            created_at=datetime.now(timezone.utc) - timedelta(days=30),
        )
        newer = Product(
            name="Brand New Textbook",
            price=Decimal("12.00"),
            stock=5,
            department=Product.DEPARTMENT_TEXTBOOKS,
            is_active=True,
            created_at=datetime.now(timezone.utc) - timedelta(hours=1),
        )
        pen = Product(
            name="Newest Pen Pack",
            price=Decimal("3.00"),
            stock=20,
            department=Product.DEPARTMENT_STATIONERY,
            is_active=True,
            created_at=datetime.now(timezone.utc),
        )
        db.session.add_all([older, newer, pen])
        db.session.commit()

    res = client.get("/api/inventory/new-releases?limit=3")
    assert res.status_code == 200
    names = [row["name"] for row in res.get_json()["data"]]
    # Textbooks are listed before stationery, newest textbook first.
    assert names[0] == "Brand New Textbook"
    assert names[1] == "Older Textbook"
    assert names[2] == "Newest Pen Pack"


def test_recommended_ranks_customer_choices_textbooks_first(client, app):
    with app.app_context():
        hot_book = Product(
            name="Hot Textbook",
            price=Decimal("15.00"),
            stock=40,
            department=Product.DEPARTMENT_TEXTBOOKS,
            is_active=True,
        )
        quiet_book = Product(
            name="Quiet Textbook",
            price=Decimal("14.00"),
            stock=40,
            department=Product.DEPARTMENT_TEXTBOOKS,
            is_active=True,
        )
        hot_pen = Product(
            name="Hot Pen",
            price=Decimal("2.00"),
            stock=100,
            department=Product.DEPARTMENT_STATIONERY,
            is_active=True,
        )
        db.session.add_all([hot_book, quiet_book, hot_pen])
        db.session.flush()

        user = User(
            name="Chooser",
            email="chooser@example.com",
            password_hash=generate_password_hash("password123"),
            role="customer",
        )
        db.session.add(user)
        db.session.flush()

        order = Booklist(
            user_id=user.id,
            status=Booklist.STATUS_SUBMITTED,
            title="Term list",
        )
        db.session.add(order)
        db.session.flush()
        db.session.add_all(
            [
                BooklistItem(
                    booklist_id=order.id,
                    product_id=hot_book.id,
                    product_name=hot_book.name,
                    quantity=5,
                    unit_price=hot_book.price,
                    line_total=Decimal("75.00"),
                ),
                BooklistItem(
                    booklist_id=order.id,
                    product_id=hot_pen.id,
                    product_name=hot_pen.name,
                    quantity=20,
                    unit_price=hot_pen.price,
                    line_total=Decimal("40.00"),
                ),
                BooklistItem(
                    booklist_id=order.id,
                    product_id=quiet_book.id,
                    product_name=quiet_book.name,
                    quantity=1,
                    unit_price=quiet_book.price,
                    line_total=Decimal("14.00"),
                ),
            ]
        )
        db.session.commit()

    res = client.get("/api/inventory/recommended?limit=3")
    assert res.status_code == 200
    names = [row["name"] for row in res.get_json()["data"]]
    # Textbooks come before stationery even if the pen sold more units.
    assert names[0] == "Hot Textbook"
    assert names[1] == "Quiet Textbook"
    assert "Hot Pen" in names
