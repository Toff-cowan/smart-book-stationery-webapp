from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func

from app.extensions.db import db


class Product(db.Model):
    __tablename__ = "products"

    DEPARTMENT_TEXTBOOKS = "textbooks"
    DEPARTMENT_STATIONERY = "stationery"
    DEPARTMENT_GIFTS = "gifts"
    DEPARTMENTS = (
        DEPARTMENT_TEXTBOOKS,
        DEPARTMENT_STATIONERY,
        DEPARTMENT_GIFTS,
    )

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    price = db.Column(db.Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    stock = db.Column(db.Integer, nullable=False, default=0)
    image_url = db.Column(db.String(500), nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    department = db.Column(
        db.String(20),
        nullable=False,
        default=DEPARTMENT_STATIONERY,
        index=True,
    )
    author = db.Column(db.String(200), nullable=True)
    publisher = db.Column(db.String(200), nullable=True)
    # Cached average of customer ratings (see ProductRating)
    rating_stars = db.Column(db.Numeric(2, 1), nullable=True)
    category_id = db.Column(
        db.Integer, db.ForeignKey("categories.id"), nullable=True, index=True
    )
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    category = db.relationship("Category", back_populates="products")
    booklist_items = db.relationship("BooklistItem", back_populates="product")
    ratings = db.relationship(
        "ProductRating",
        back_populates="product",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )

    def rating_count(self):
        return self.ratings.count()

    def refresh_rating_average(self):
        """Recompute cached average from customer ratings."""
        from app.models.product_rating import ProductRating

        result = (
            db.session.query(
                func.avg(ProductRating.stars),
                func.count(ProductRating.id),
            )
            .filter(ProductRating.product_id == self.id)
            .one()
        )
        avg, count = result
        if not count:
            self.rating_stars = None
        else:
            self.rating_stars = Decimal(str(round(float(avg), 1)))
        return self.rating_stars

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "price": float(self.price) if self.price is not None else 0.0,
            "stock": self.stock,
            "quantity": self.stock,
            "department": self.department,
            "author": self.author,
            "publisher": self.publisher,
            "rating_stars": (
                float(self.rating_stars) if self.rating_stars is not None else None
            ),
            "rating_count": self.rating_count(),
            "image_url": self.image_url,
            "is_active": self.is_active,
            "category_id": self.category_id,
        }
