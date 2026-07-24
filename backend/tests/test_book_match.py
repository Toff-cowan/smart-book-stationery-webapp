from app.models import Product
from app.services.book_match_service import match_titles


def test_match_titles_suggests_close_names(app):
    with app.app_context():
        product = Product(
            name="Atomic Habits",
            price=20,
            stock=5,
            department=Product.DEPARTMENT_TEXTBOOKS,
            author="James Clear",
            school="Campion College",
            is_active=True,
        )
        from app.extensions.db import db

        db.session.add(product)
        db.session.flush()
        product.set_grades(["Grade 10"])
        db.session.commit()

        result = match_titles(
            ["Atomic Habit"],
            school="Campion College",
            grade="Grade 10",
        )
        assert result["catalog_count"] >= 1
        assert result["results"]
        row = result["results"][0]
        assert row["status"] in ("matched", "suggested", "unmatched")
        if row["status"] == "matched":
            assert row["match"]
            assert row["match"]["name"] == "Atomic Habits"
            assert row["suggestions"] == []
        else:
            assert row["suggestions"]
            assert row["suggestions"][0]["name"] == "Atomic Habits"


def test_writing_practice_k2_not_confused_with_reading(app):
    """OCR 'kindergarten Writing Practice k2' must prefer Let's Learn Writing Practice K2."""
    from decimal import Decimal

    from app.extensions.db import db

    with app.app_context():
        correct = Product(
            name="Let's Learn Writing Practice K2",
            price=Decimal("1940.00"),
            stock=100,
            department=Product.DEPARTMENT_TEXTBOOKS,
            is_active=True,
        )
        wrong_reading = Product(
            name="Reading & Comprehension K2",
            price=Decimal("2340.00"),
            stock=100,
            department=Product.DEPARTMENT_TEXTBOOKS,
            is_active=True,
        )
        wrong_level = Product(
            name="Writing Practice 2A",
            price=Decimal("1100.00"),
            stock=100,
            department=Product.DEPARTMENT_TEXTBOOKS,
            is_active=True,
        )
        decoys = [
            Product(
                name=name,
                price=Decimal("2000.00"),
                stock=50,
                department=Product.DEPARTMENT_TEXTBOOKS,
                is_active=True,
            )
            for name in (
                "Creative Writing Grade 1",
                "Creative Writing Grade 3",
                "Grade 1 Creative Writing",
            )
        ]
        db.session.add_all([correct, wrong_reading, wrong_level, *decoys])
        db.session.commit()

        result = match_titles(
            ["kindergarten Writing Practice k2"],
            grade="Kindergarten",
        )
        row = result["results"][0]
        names = []
        if row["match"]:
            names.append(row["match"]["name"])
        names.extend(s["name"] for s in row["suggestions"])

        assert "Let's Learn Writing Practice K2" in names
        assert names[0] == "Let's Learn Writing Practice K2"
        # Must not claim Reading & Comprehension is a perfect match.
        if row["match"]:
            assert row["match"]["name"] != "Reading & Comprehension K2"
        reading = next(
            (s for s in row["suggestions"] if s["name"] == "Reading & Comprehension K2"),
            None,
        )
        if reading:
            assert reading["confidence"] < 95

