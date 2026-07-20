"""booklist file uploads from customers

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-07-20 10:15:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "d4e5f6a7b8c9"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS booklist_uploads (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            original_name VARCHAR(255) NOT NULL,
            stored_name VARCHAR(255) NOT NULL,
            content_type VARCHAR(120),
            size_bytes INTEGER NOT NULL DEFAULT 0,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_booklist_uploads_user_id "
        "ON booklist_uploads (user_id)"
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_booklist_uploads_user_id")
    op.execute("DROP TABLE IF EXISTS booklist_uploads")
