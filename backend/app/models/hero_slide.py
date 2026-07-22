from datetime import datetime, timezone

from app.extensions.db import db


class HeroSlide(db.Model):
    __tablename__ = "hero_slides"

    id = db.Column(db.Integer, primary_key=True)
    subtitle = db.Column(db.String(300), nullable=False)
    primary_label = db.Column(db.String(80), nullable=False, default="Shop Now")
    primary_href = db.Column(db.String(300), nullable=False, default="/catalog")
    secondary_label = db.Column(db.String(80), nullable=False, default="View All")
    secondary_href = db.Column(db.String(300), nullable=False, default="/catalog")
    image_url = db.Column(db.String(500), nullable=True)
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
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

    def to_dict(self):
        return {
            "id": self.id,
            "subtitle": self.subtitle,
            "primary_label": self.primary_label,
            "primary_href": self.primary_href,
            "secondary_label": self.secondary_label,
            "secondary_href": self.secondary_href,
            "image_url": self.image_url,
            "sort_order": self.sort_order,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
