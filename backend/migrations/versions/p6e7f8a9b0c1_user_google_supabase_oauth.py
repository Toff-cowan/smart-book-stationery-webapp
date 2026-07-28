"""user google supabase oauth fields

Revision ID: p6e7f8a9b0c1
Revises: o5d6e7f8a9b0
Create Date: 2026-07-27 21:00:00.000000

"""
from alembic import op


revision = "p6e7f8a9b0c1"
down_revision = "o5d6e7f8a9b0"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL")
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS supabase_user_id VARCHAR(64)"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_supabase_user_id "
        "ON users (supabase_user_id)"
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_users_supabase_user_id")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS supabase_user_id")
    # Do not re-add NOT NULL without filling nulls; leave nullable on downgrade.
