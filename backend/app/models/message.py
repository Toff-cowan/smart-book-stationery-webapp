from datetime import datetime, timezone

from app.extensions.db import db


class Message(db.Model):
    """Simple customer ↔ bookstore messages."""

    __tablename__ = "messages"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )
    sender_role = db.Column(db.String(20), nullable=False)  # customer | admin
    body = db.Column(db.Text, nullable=False)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    user = db.relationship("User", back_populates="messages")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "sender_role": self.sender_role,
            "body": self.body,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
