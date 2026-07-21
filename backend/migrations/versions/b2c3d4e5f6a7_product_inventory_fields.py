"""product inventory fields: department, author, publisher, rating_stars

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-17 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade():
    # Idempotent for environments where columns were applied via SQL/MCP first
    op.execute(
        """
        ALTER TABLE products
        ADD COLUMN IF NOT EXISTS department VARCHAR(20) NOT NULL DEFAULT 'stationery'
        """
    )
    op.execute(
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS author VARCHAR(200)"
    )
    op.execute(
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS publisher VARCHAR(200)"
    )
    op.execute(
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS rating_stars NUMERIC(2, 1)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_products_department ON products (department)"
    )

    op.execute(
        """
        UPDATE products
        SET department = 'textbooks'
        WHERE category_id IN (
            SELECT id FROM categories WHERE lower(name) LIKE '%book%'
        )
        OR lower(name) LIKE '%textbook%'
        OR lower(name) LIKE '%literature%'
        OR lower(name) LIKE '%anthology%'
        """
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_products_department")
    with op.batch_alter_table("products", schema=None) as batch_op:
        batch_op.drop_column("rating_stars")
        batch_op.drop_column("publisher")
        batch_op.drop_column("author")
        batch_op.drop_column("department")
