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
            Product(
                name="Language Arts Workbook Grade 1",
                description="Primary language arts",
                price=Decimal("15.00"),
                stock=8,
                category_id=cat.id,
                is_active=True,
                department="textbooks",
            ),
            Product(
                name="Primary Maths Practice Grade 2",
                description="Math drills",
                price=Decimal("10.00"),
                stock=4,
                category_id=cat.id,
                is_active=True,
                department="textbooks",
            ),
        ]
        db.session.add_all(books)
        db.session.flush()
        books[3].set_grades(["Grade 1"])
        books[4].set_grades(["Grade 2"])
        books[0].set_grades(["Grade 3"])
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


def test_search_number_words_and_digits(client, app):
    _seed_books(app)

    for q in ("grade one", "grade 1", "gr one", "language arts"):
        res = client.get(f"/api/inventory?q={q}")
        assert res.status_code == 200, q
        names = [row["name"] for row in res.get_json()["data"]]
        assert "Language Arts Workbook Grade 1" in names, f"{q} -> {names}"

    res2 = client.get("/api/inventory?q=grade%20two")
    assert res2.status_code == 200
    names2 = [row["name"] for row in res2.get_json()["data"]]
    assert "Primary Maths Practice Grade 2" in names2


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


def test_grades_endpoint_includes_standards(client, app):
    _seed_books(app)

    res = client.get("/api/inventory/grades")
    assert res.status_code == 200
    data = res.get_json()["data"]
    names = [row["name"] for row in data]
    assert "K1" in names
    assert "K2" in names
    assert "Grade 1" in names
    assert "Grade 11" in names
    grade1 = next(row for row in data if row["name"] == "Grade 1")
    assert grade1["count"] >= 1


def test_filter_by_grade_tag(client, app):
    _seed_books(app)

    res = client.get("/api/inventory?grade=Grade%201")
    assert res.status_code == 200
    names = [row["name"] for row in res.get_json()["data"]]
    assert "Language Arts Workbook Grade 1" in names
    assert "Grade 3 Integrated Reader" not in names


def test_search_infant_integrated_maths(client, app):
    _seed_books(app)
    from app.extensions.db import db
    from app.models import Category, Product
    from decimal import Decimal

    with app.app_context():
        cat = Category.query.first()
        books = [
            Product(
                name="Infant Integrated Math 2",
                price=Decimal("12.00"),
                stock=5,
                category_id=cat.id,
                is_active=True,
                department="textbooks",
            ),
            Product(
                name="Easy Steps in Creative Writing",
                price=Decimal("8.00"),
                stock=5,
                category_id=cat.id,
                is_active=True,
                department="textbooks",
            ),
            Product(
                name="Blue Ballpoint Pen Pack (10)",
                price=Decimal("6.00"),
                stock=20,
                category_id=cat.id,
                is_active=True,
                department="stationery",
            ),
        ]
        db.session.add_all(books)
        db.session.commit()

    res = client.get("/api/inventory?q=infant%20integrated%20Mathematics&per_page=10")
    assert res.status_code == 200
    names = [row["name"] for row in res.get_json()["data"]]
    assert "Infant Integrated Math 2" in names
    assert "Blue Ballpoint Pen Pack (10)" not in names
    assert "Easy Steps in Creative Writing" not in names
