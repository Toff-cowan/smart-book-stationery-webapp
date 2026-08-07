from datetime import datetime, timezone
from decimal import Decimal
import re

from sqlalchemy import func

from app.extensions.db import db


def _normalize_grade_label(value):
    """Canonicalize grade tags so filters match consistently."""
    if value is None:
        return None
    label = " ".join(str(value).split())
    if not label:
        return None
    text = label.casefold().strip()
    k = re.fullmatch(r"k\s*[-]?\s*([123])", text)
    if k:
        return f"K{k.group(1)}"
    grade = re.fullmatch(r"(?:grade|gr|g)\s*[-]?\s*(\d{1,2})", text)
    if grade:
        n = int(grade.group(1))
        if 1 <= n <= 13:
            return f"Grade {n}"
    form = re.fullmatch(r"(?:form|f)\s*[-]?\s*(\d{1,2})", text)
    if form:
        n = int(form.group(1))
        if 1 <= n <= 6:
            return f"Form {n}"
    # Bare digit 1–13 → Grade N
    bare = re.fullmatch(r"(\d{1,2})", text)
    if bare:
        n = int(bare.group(1))
        if 1 <= n <= 13:
            return f"Grade {n}"
    return label


def grade_sort_key(label: str):
    """Sort Grade/Form/K labels in a natural education order."""
    text = (label or "").strip().casefold()
    if text == "k1":
        return (-3, label)
    if text == "k2":
        return (-2, label)
    if text == "k3":
        return (-1, label)
    for prefix, base in (("grade ", 0), ("form ", 100)):
        if text.startswith(prefix):
            rest = text[len(prefix) :].strip()
            try:
                return (base + int(rest), label)
            except ValueError:
                return (base + 50, label)
    return (1000, label)


# Standard tags offered in admin + catalog filters.
STANDARD_GRADE_LABELS = (
    "K1",
    "K2",
    "K3",
    *[f"Grade {n}" for n in range(1, 12)],
)


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
    vendor = db.Column(db.String(200), nullable=True, index=True)
    isbn = db.Column(db.String(32), nullable=True, index=True)
    school = db.Column(db.String(200), nullable=True, index=True)
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
    grade_tags = db.relationship(
        "ProductGrade",
        back_populates="product",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def get_grades(self):
        return sorted(
            (tag.grade for tag in self.grade_tags),
            key=grade_sort_key,
        )

    def set_grades(self, grades):
        """Replace hidden grade tags used for catalog filters."""
        from app.models.product_grade import ProductGrade

        normalized = []
        seen = set()
        for raw in grades or []:
            label = _normalize_grade_label(raw)
            if not label:
                continue
            key = label.casefold()
            if key in seen:
                continue
            seen.add(key)
            normalized.append(label)

        # Flush deletes before inserts so uq_product_grade is not violated.
        if self.id is not None:
            ProductGrade.query.filter_by(product_id=self.id).delete(
                synchronize_session=False
            )
            db.session.flush()
            db.session.expire(self, ["grade_tags"])
        else:
            self.grade_tags.clear()

        for label in normalized:
            self.grade_tags.append(ProductGrade(grade=label))
        return self.get_grades()

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

    def to_dict(self, *, include_rating_count: bool = False):
        data = {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "price": float(self.price) if self.price is not None else 0.0,
            "stock": self.stock,
            "quantity": self.stock,
            "department": self.department,
            "author": self.author,
            "publisher": self.publisher,
            "vendor": self.vendor,
            "isbn": self.isbn,
            "school": self.school,
            "grades": self.get_grades(),
            "rating_stars": (
                float(self.rating_stars) if self.rating_stars is not None else None
            ),
            "image_url": self.image_url,
            "is_active": self.is_active,
            "category_id": self.category_id,
        }
        # Avoid N+1 COUNT queries on list endpoints.
        if include_rating_count:
            data["rating_count"] = self.rating_count()
        else:
            data["rating_count"] = None
        return data
