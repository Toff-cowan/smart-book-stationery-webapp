from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import and_, func, not_, or_

from app.extensions.db import db


class Booklist(db.Model):
    """Customer booklist: draft working list or submitted list for the bookstore."""

    __tablename__ = "booklists"

    STATUS_DRAFT = "draft"
    STATUS_SUBMITTED = "submitted"
    STATUS_IN_PROGRESS = "in_progress"
    STATUS_READY = "ready"
    STATUS_COMPLETED = "completed"
    STATUS_CANCELLED = "cancelled"

    # Orders counted toward best sellers (fulfilled / purchase complete)
    COMPLETED_STATUSES = (STATUS_READY, STATUS_COMPLETED)

    # Retention: cancelled (deleted) vanish after 30 days; completed after 1 year.
    CANCELLED_RETENTION = timedelta(days=30)
    COMPLETED_RETENTION = timedelta(days=365)

    FULFILLMENT_RESERVE = "reserve"
    FULFILLMENT_PICKUP = "pickup"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )
    status = db.Column(db.String(30), nullable=False, default=STATUS_DRAFT, index=True)
    title = db.Column(db.String(200), nullable=True)
    fulfillment_type = db.Column(db.String(20), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    contact_email = db.Column(db.String(255), nullable=True)
    contact_phone = db.Column(db.String(40), nullable=True)
    share_token = db.Column(db.String(64), unique=True, nullable=True, index=True)
    grand_total = db.Column(
        db.Numeric(12, 2), nullable=False, default=Decimal("0.00")
    )
    submitted_at = db.Column(db.DateTime(timezone=True), nullable=True)
    cancelled_at = db.Column(db.DateTime(timezone=True), nullable=True)
    completed_at = db.Column(db.DateTime(timezone=True), nullable=True)
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

    user = db.relationship("User", back_populates="booklists")
    items = db.relationship(
        "BooklistItem",
        back_populates="booklist",
        cascade="all, delete-orphan",
        lazy="joined",
    )

    def apply_status_timestamps(self, new_status: str | None = None):
        """Stamp cancelled_at / completed_at when entering those statuses."""
        status = new_status or self.status
        now = datetime.now(timezone.utc)
        if status == self.STATUS_CANCELLED and self.cancelled_at is None:
            self.cancelled_at = now
        if status == self.STATUS_COMPLETED and self.completed_at is None:
            self.completed_at = now

    @classmethod
    def retention_visible_clause(cls):
        """SQL filter: hide cancelled >30d and completed >1y (until hard-purged)."""
        now = datetime.now(timezone.utc)
        cancelled_cutoff = now - cls.CANCELLED_RETENTION
        completed_cutoff = now - cls.COMPLETED_RETENTION
        cancelled_ref = func.coalesce(cls.cancelled_at, cls.updated_at)
        completed_ref = func.coalesce(cls.completed_at, cls.updated_at)
        expired_cancelled = and_(
            cls.status == cls.STATUS_CANCELLED,
            cancelled_ref < cancelled_cutoff,
        )
        expired_completed = and_(
            cls.status == cls.STATUS_COMPLETED,
            completed_ref < completed_cutoff,
        )
        return not_(or_(expired_cancelled, expired_completed))

    def recalculate_total(self):
        items = BooklistItem.query.filter_by(booklist_id=self.id).all()
        total = sum((item.line_total or Decimal("0.00")) for item in items)
        self.grand_total = total
        return self.grand_total

    def to_dict(self, include_items=True):
        data = {
            "id": self.id,
            "user_id": self.user_id,
            "status": self.status,
            "title": self.title,
            "fulfillment_type": self.fulfillment_type,
            "notes": self.notes,
            "contact_email": self.contact_email,
            "contact_phone": self.contact_phone,
            "share_token": self.share_token,
            "grand_total": float(self.grand_total) if self.grand_total is not None else 0.0,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
            "cancelled_at": self.cancelled_at.isoformat() if self.cancelled_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_items:
            data["items"] = [item.to_dict() for item in self.items]
        return data


class BooklistItem(db.Model):
    __tablename__ = "booklist_items"

    id = db.Column(db.Integer, primary_key=True)
    booklist_id = db.Column(
        db.Integer, db.ForeignKey("booklists.id"), nullable=False, index=True
    )
    product_id = db.Column(
        db.Integer, db.ForeignKey("products.id"), nullable=False, index=True
    )
    product_name = db.Column(db.String(200), nullable=False)
    quantity = db.Column(db.Integer, nullable=False, default=1)
    unit_price = db.Column(db.Numeric(10, 2), nullable=False)
    line_total = db.Column(db.Numeric(12, 2), nullable=False)

    booklist = db.relationship("Booklist", back_populates="items")
    product = db.relationship("Product", back_populates="booklist_items")

    def to_dict(self):
        product = self.product
        return {
            "id": self.id,
            "booklist_id": self.booklist_id,
            "product_id": self.product_id,
            "product_name": self.product_name,
            "quantity": self.quantity,
            "unit_price": float(self.unit_price) if self.unit_price is not None else 0.0,
            "line_total": float(self.line_total) if self.line_total is not None else 0.0,
            "image_url": product.image_url if product else None,
            "department": product.department if product else None,
            "stock": product.stock if product else None,
            "author": product.author if product else None,
        }
