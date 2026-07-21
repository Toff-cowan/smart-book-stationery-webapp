from datetime import datetime, timezone

from app.extensions.db import db


class BooklistUpload(db.Model):
    """Customer-uploaded school booklist file for bookstore review."""

    __tablename__ = "booklist_uploads"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True, index=True
    )
    school = db.Column(db.String(200), nullable=True, index=True)
    original_name = db.Column(db.String(255), nullable=False)
    stored_name = db.Column(db.String(255), nullable=False)
    content_type = db.Column(db.String(120), nullable=True)
    size_bytes = db.Column(db.Integer, nullable=False, default=0)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    user = db.relationship("User", back_populates="booklist_uploads")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "school": self.school,
            "original_name": self.original_name,
            "content_type": self.content_type,
            "size_bytes": self.size_bytes,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
