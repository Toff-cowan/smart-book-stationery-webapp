"""customer product ratings table

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-07-17 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS product_ratings (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            product_id INTEGER NOT NULL REFERENCES products(id),
            stars INTEGER NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_product_ratings_user_product UNIQUE (user_id, product_id)
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_product_ratings_product_id "
        "ON product_ratings (product_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_product_ratings_user_id "
        "ON product_ratings (user_id)"
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_product_ratings_user_id")
    op.execute("DROP INDEX IF EXISTS ix_product_ratings_product_id")
    op.execute("DROP TABLE IF EXISTS product_ratings")
