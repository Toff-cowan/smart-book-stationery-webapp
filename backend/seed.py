"""Seed Supabase with an admin user and sample catalog data."""

import os
from decimal import Decimal

from dotenv import load_dotenv
from werkzeug.security import generate_password_hash

load_dotenv()

from app import create_app
from app.extensions.db import db
from app.models import User, Category, Product


def seed():
    app = create_app()
    with app.app_context():
        admin_email = os.getenv("SEED_ADMIN_EMAIL", "admin@smartbook.local").lower()
        admin_password = os.getenv("SEED_ADMIN_PASSWORD", "ChangeMeAdmin123!")
        admin_name = os.getenv("SEED_ADMIN_NAME", "Bookstore Admin")

        admin = User.query.filter_by(email=admin_email).first()
        if not admin:
            admin = User(
                name=admin_name,
                email=admin_email,
                password_hash=generate_password_hash(admin_password),
                role="admin",
            )
            db.session.add(admin)
            print(f"Created admin: {admin_email}")
        else:
            print(f"Admin already exists: {admin_email}")

        categories = [
            ("Books", "Textbooks and reading materials"),
            ("Stationery", "Pens, notebooks, and school supplies"),
        ]
        category_map = {}
        for name, description in categories:
            category = Category.query.filter_by(name=name).first()
            if not category:
                category = Category(name=name, description=description)
                db.session.add(category)
                db.session.flush()
                print(f"Created category: {name}")
            category_map[name] = category

        products = [
            ("Mathematics Textbook Grade 10", "Core math textbook", Decimal("45.00"), 25, "Books"),
            ("English Literature Anthology", "Short stories and poems", Decimal("32.50"), 40, "Books"),
            ("A4 Exercise Book (80 pages)", "Ruled exercise book", Decimal("3.50"), 200, "Stationery"),
            ("Blue Ballpoint Pen Pack (10)", "Smooth writing pens", Decimal("5.99"), 150, "Stationery"),
            ("Geometry Set", "Compass, protractor, and rulers", Decimal("12.00"), 60, "Stationery"),
        ]

        for name, description, price, stock, category_name in products:
            existing = Product.query.filter_by(name=name).first()
            if existing:
                continue
            product = Product(
                name=name,
                description=description,
                price=price,
                stock=stock,
                category_id=category_map[category_name].id,
                is_active=True,
            )
            db.session.add(product)
            print(f"Created product: {name}")

        db.session.commit()
        print("Seed complete.")


if __name__ == "__main__":
    seed()
