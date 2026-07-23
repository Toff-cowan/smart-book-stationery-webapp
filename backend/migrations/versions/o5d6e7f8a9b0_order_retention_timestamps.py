"""order retention timestamps cancelled_at completed_at

Revision ID: o5d6e7f8a9b0
Revises: n4c5d6e7f8a9
Create Date: 2026-07-23 04:30:00.000000

"""
from alembic import op


revision = "o5d6e7f8a9b0"
down_revision = "n4c5d6e7f8a9"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE booklists ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ"
    )
    op.execute(
        "ALTER TABLE booklists ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_booklists_cancelled_at ON booklists (cancelled_at)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_booklists_completed_at ON booklists (completed_at)"
    )
    # Backfill from updated_at so existing rows start the retention clock fairly.
    op.execute(
        """
        UPDATE booklists
        SET cancelled_at = COALESCE(cancelled_at, updated_at)
        WHERE status = 'cancelled' AND cancelled_at IS NULL
        """
    )
    op.execute(
        """
        UPDATE booklists
        SET completed_at = COALESCE(completed_at, updated_at)
        WHERE status = 'completed' AND completed_at IS NULL
        """
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_booklists_completed_at")
    op.execute("DROP INDEX IF EXISTS ix_booklists_cancelled_at")
    op.execute("ALTER TABLE booklists DROP COLUMN IF EXISTS completed_at")
    op.execute("ALTER TABLE booklists DROP COLUMN IF EXISTS cancelled_at")
