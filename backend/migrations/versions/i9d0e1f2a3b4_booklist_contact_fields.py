"""booklist contact email and phone

Revision ID: i9d0e1f2a3b4
Revises: h8c9d0e1f2a3
Create Date: 2026-07-20 15:15:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "i9d0e1f2a3b4"
down_revision = "h8c9d0e1f2a3"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE booklists ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255)"
    )
    op.execute(
        "ALTER TABLE booklists ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(40)"
    )


def downgrade():
    with op.batch_alter_table("booklists", schema=None) as batch_op:
        batch_op.drop_column("contact_phone")
        batch_op.drop_column("contact_email")
