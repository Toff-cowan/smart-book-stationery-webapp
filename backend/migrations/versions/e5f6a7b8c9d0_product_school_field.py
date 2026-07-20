"""product school field for catalog filtering

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-20 10:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS school VARCHAR(200)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_products_school ON products (school)"
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_products_school")
    with op.batch_alter_table("products", schema=None) as batch_op:
        batch_op.drop_column("school")
