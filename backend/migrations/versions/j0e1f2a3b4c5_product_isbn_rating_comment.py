"""product isbn and rating comment

Revision ID: j0e1f2a3b4c5
Revises: i9d0e1f2a3b4
Create Date: 2026-07-21 10:40:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "j0e1f2a3b4c5"
down_revision = "i9d0e1f2a3b4"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS isbn VARCHAR(32)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_products_isbn ON products (isbn)"
    )
    op.execute(
        "ALTER TABLE product_ratings ADD COLUMN IF NOT EXISTS comment TEXT"
    )


def downgrade():
    with op.batch_alter_table("product_ratings", schema=None) as batch_op:
        batch_op.drop_column("comment")
    with op.batch_alter_table("products", schema=None) as batch_op:
        batch_op.drop_index("ix_products_isbn")
        batch_op.drop_column("isbn")
