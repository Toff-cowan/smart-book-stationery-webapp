"""hero carousel slides

Revision ID: m3b4c5d6e7f8
Revises: l2a3b4c5d6e7
Create Date: 2026-07-22 12:00:00.000000

"""
from alembic import op


revision = "m3b4c5d6e7f8"
down_revision = "l2a3b4c5d6e7"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS hero_slides (
            id SERIAL PRIMARY KEY,
            subtitle VARCHAR(300) NOT NULL,
            primary_label VARCHAR(80) NOT NULL DEFAULT 'Shop Now',
            primary_href VARCHAR(300) NOT NULL DEFAULT '/catalog',
            secondary_label VARCHAR(80) NOT NULL DEFAULT 'View All',
            secondary_href VARCHAR(300) NOT NULL DEFAULT '/catalog',
            image_url VARCHAR(500),
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        """
        INSERT INTO hero_slides (
            subtitle, primary_label, primary_href,
            secondary_label, secondary_href, sort_order, is_active
        )
        SELECT * FROM (VALUES
            (
                'Shop textbooks & stationery. Reserve online for in-store pickup.',
                'Shop Now', '/catalog',
                'View All', '/catalog',
                0, TRUE
            ),
            (
                'Find your school booklist — or upload it if it is not listed yet.',
                'Shop Now', '/catalog',
                'Find school list', '/#booklists',
                1, TRUE
            ),
            (
                'Pens, books, and supplies ready for the new term.',
                'Shop Stationery', '/catalog?department=stationery',
                'View All', '/catalog',
                2, TRUE
            )
        ) AS seed(
            subtitle, primary_label, primary_href,
            secondary_label, secondary_href, sort_order, is_active
        )
        WHERE NOT EXISTS (SELECT 1 FROM hero_slides LIMIT 1)
        """
    )


def downgrade():
    op.execute("DROP TABLE IF EXISTS hero_slides")
