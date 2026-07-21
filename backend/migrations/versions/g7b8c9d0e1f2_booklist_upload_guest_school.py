"""nullable user_id and school on booklist uploads

Revision ID: g7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-07-20 11:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "g7b8c9d0e1f2"
down_revision = "f6a7b8c9d0e1"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE booklist_uploads ADD COLUMN IF NOT EXISTS school VARCHAR(200)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_booklist_uploads_school "
        "ON booklist_uploads (school)"
    )
    op.execute(
        "ALTER TABLE booklist_uploads ALTER COLUMN user_id DROP NOT NULL"
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_booklist_uploads_school")
    with op.batch_alter_table("booklist_uploads", schema=None) as batch_op:
        batch_op.drop_column("school")
    # Re-adding NOT NULL may fail if nulls exist; leave nullable on downgrade
    # for safety in shared/dev DBs.
