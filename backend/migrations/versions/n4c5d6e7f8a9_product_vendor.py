"""product vendor column

Revision ID: n4c5d6e7f8a9
Revises: m3b4c5d6e7f8
Create Date: 2026-07-22 16:55:00.000000

"""
from alembic import op


revision = "n4c5d6e7f8a9"
down_revision = "m3b4c5d6e7f8"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS vendor VARCHAR(200)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_products_vendor ON products (vendor)"
    )
    # Earlier QB import stored Vendor Name in publisher — move to vendor.
    op.execute(
        """
        UPDATE products
        SET vendor = publisher, publisher = NULL
        WHERE id > 6
          AND publisher IS NOT NULL
          AND (vendor IS NULL OR btrim(vendor) = '')
        """
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_products_vendor")
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS vendor")
