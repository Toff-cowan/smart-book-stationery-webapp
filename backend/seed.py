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
            ("Gifts", "Gift items and accessories"),
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
            {
                "name": "Mathematics Textbook Grade 10",
                "description": "Core math textbook",
                "price": Decimal("45.00"),
                "stock": 25,
                "category": "Books",
                "department": Product.DEPARTMENT_TEXTBOOKS,
                "author": "A. Rivera",
                "publisher": "EduPress",
                "school": "Campion College",
                "grades": ["Grade 10", "Form 4"],
            },
            {
                "name": "English Literature Anthology",
                "description": "Short stories and poems",
                "price": Decimal("32.50"),
                "stock": 40,
                "category": "Books",
                "department": Product.DEPARTMENT_TEXTBOOKS,
                "author": "Various",
                "publisher": "Classic House",
                "school": "Campion College",
                "grades": ["Grade 9", "Grade 10", "Form 3", "Form 4"],
            },
            {
                "name": "A4 Exercise Book (80 pages)",
                "description": "Ruled exercise book",
                "price": Decimal("3.50"),
                "stock": 200,
                "category": "Stationery",
                "department": Product.DEPARTMENT_STATIONERY,
                "school": "Kingston College",
                "grades": ["Grade 7", "Grade 8", "Form 1", "Form 2"],
            },
            {
                "name": "Blue Ballpoint Pen Pack (10)",
                "description": "Smooth writing pens",
                "price": Decimal("5.99"),
                "stock": 150,
                "category": "Stationery",
                "department": Product.DEPARTMENT_STATIONERY,
                "school": "Kingston College",
                "grades": ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"],
            },
            {
                "name": "Geometry Set",
                "description": "Compass, protractor, and rulers",
                "price": Decimal("12.00"),
                "stock": 60,
                "category": "Stationery",
                "department": Product.DEPARTMENT_STATIONERY,
                "school": "Immaculate Conception High",
                "grades": ["Grade 7", "Grade 8", "Grade 9", "Form 1", "Form 2", "Form 3"],
            },
            {
                "name": "Bookstore Tote Bag",
                "description": "Canvas tote with store logo",
                "price": Decimal("18.00"),
                "stock": 35,
                "category": "Gifts",
                "department": Product.DEPARTMENT_GIFTS,
                "school": None,
                "grades": [],
            },
        ]

        for item in products:
            existing = Product.query.filter_by(name=item["name"]).first()
            if existing:
                existing.department = item["department"]
                existing.author = item.get("author")
                existing.publisher = item.get("publisher")
                existing.school = item.get("school")
                if item["category"] in category_map:
                    existing.category_id = category_map[item["category"]].id
                existing.set_grades(item.get("grades") or [])
                print(f"Updated product: {item['name']}")
                continue
            product = Product(
                name=item["name"],
                description=item["description"],
                price=item["price"],
                stock=item["stock"],
                category_id=category_map[item["category"]].id,
                department=item["department"],
                author=item.get("author"),
                publisher=item.get("publisher"),
                school=item.get("school"),
                is_active=True,
            )
            db.session.add(product)
            db.session.flush()
            product.set_grades(item.get("grades") or [])
            print(f"Created product: {item['name']}")

        db.session.commit()
        print("Seed complete.")


if __name__ == "__main__":
    seed()
