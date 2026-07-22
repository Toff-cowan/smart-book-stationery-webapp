"""user profile phone and avatar

Revision ID: k1f2a3b4c5d6
Revises: j0e1f2a3b4c5
Create Date: 2026-07-22 11:30:00.000000

"""
from alembic import op


revision = "k1f2a3b4c5d6"
down_revision = "j0e1f2a3b4c5"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(40)"
    )
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500)"
    )


def downgrade():
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS avatar_url")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS phone")
