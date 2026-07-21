from app.extensions.db import db


class ProductGrade(db.Model):
    """Hidden education-level tags used for catalog grade filters."""

    __tablename__ = "product_grades"
    __table_args__ = (
        db.UniqueConstraint("product_id", "grade", name="uq_product_grade"),
    )

    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(
        db.Integer,
        db.ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    grade = db.Column(db.String(80), nullable=False, index=True)

    product = db.relationship("Product", back_populates="grade_tags")
