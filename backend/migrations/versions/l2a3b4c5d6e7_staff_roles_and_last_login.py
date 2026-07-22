"""staff roles owner/employee and last login timestamps

Revision ID: l2a3b4c5d6e7
Revises: k1f2a3b4c5d6
Create Date: 2026-07-22 11:40:00.000000

"""
from alembic import op


revision = "l2a3b4c5d6e7"
down_revision = "k1f2a3b4c5d6"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ"
    )
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_admin_login_at TIMESTAMPTZ"
    )
    op.execute("UPDATE users SET role = 'owner' WHERE role = 'admin'")


def downgrade():
    op.execute("UPDATE users SET role = 'admin' WHERE role = 'owner'")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS last_admin_login_at")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS last_login_at")
