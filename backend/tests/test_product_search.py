"""Fuzzy catalog search by name / ISBN."""

from decimal import Decimal


def _seed_books(app):
    from app.extensions.db import db
    from app.models import Category, Product

    with app.app_context():
        cat = Category(name="Books", description="Test")
        db.session.add(cat)
        db.session.flush()
        books = [
            Product(
                name="Grade 3 Integrated Reader",
                description="Primary reader",
                price=Decimal("12.00"),
                stock=5,
                category_id=cat.id,
                isbn="978-976-610-333-1",
                is_active=True,
                department="textbooks",
            ),
            Product(
                name="Atomic Habits",
                description="Self help",
                price=Decimal("25.00"),
                stock=3,
                category_id=cat.id,
                isbn="9780735211292",
                is_active=True,
                department="textbooks",
            ),
            Product(
                name="Blue Pen Pack",
                description="Stationery",
                price=Decimal("3.00"),
                stock=50,
                category_id=cat.id,
                is_active=True,
                department="stationery",
            ),
        ]
        db.session.add_all(books)
        db.session.commit()
        return [b.id for b in books]


def test_search_by_abbreviation_and_word_order(client, app):
    _seed_books(app)

    for q in (
        "gr 3 integrated reader",
        "int reader 3",
        "reader 3",
        "integ reader gr 3",
        "Integrateed Reader 3",  # typo
    ):
        res = client.get(f"/api/inventory?q={q}")
        assert res.status_code == 200, q
        names = [row["name"] for row in res.get_json()["data"]]
        assert "Grade 3 Integrated Reader" in names, f"{q} -> {names}"


def test_search_by_isbn_digits(client, app):
    _seed_books(app)

    res = client.get("/api/inventory?q=9789766103331")
    assert res.status_code == 200
    names = [row["name"] for row in res.get_json()["data"]]
    assert names[0] == "Grade 3 Integrated Reader"

    res2 = client.get("/api/inventory?q=978-073-521-1292")
    assert res2.status_code == 200
    names2 = [row["name"] for row in res2.get_json()["data"]]
    assert "Atomic Habits" in names2


def test_search_ranks_relevant_first(client, app):
    _seed_books(app)

    res = client.get("/api/inventory?q=atomic habit")
    assert res.status_code == 200
    data = res.get_json()["data"]
    assert data
    assert data[0]["name"] == "Atomic Habits"
