from datetime import datetime, timezone

from app.extensions.db import db


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="customer")
    phone = db.Column(db.String(40), nullable=True)
    avatar_url = db.Column(db.String(500), nullable=True)
    last_login_at = db.Column(db.DateTime(timezone=True), nullable=True)
    last_admin_login_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    booklists = db.relationship("Booklist", back_populates="user", lazy="dynamic")
    notifications = db.relationship(
        "Notification", back_populates="user", lazy="dynamic"
    )
    messages = db.relationship("Message", back_populates="user", lazy="dynamic")
    product_ratings = db.relationship(
        "ProductRating", back_populates="user", lazy="dynamic"
    )
    booklist_uploads = db.relationship(
        "BooklistUpload", back_populates="user", lazy="dynamic"
    )

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "phone": self.phone,
            "avatar_url": self.avatar_url,
            "last_login_at": (
                self.last_login_at.isoformat() if self.last_login_at else None
            ),
            "last_admin_login_at": (
                self.last_admin_login_at.isoformat()
                if self.last_admin_login_at
                else None
            ),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def to_admin_dict(self):
        """Owner-facing user directory row."""
        data = self.to_dict()
        data.pop("avatar_url", None)
        return data
