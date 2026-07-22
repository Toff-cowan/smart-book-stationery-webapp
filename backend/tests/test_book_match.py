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
        assert row["status"] in ("matched", "suggested")
        assert row["suggestions"]
        assert row["suggestions"][0]["name"] == "Atomic Habits"
