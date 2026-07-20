"""customer features: booklist fields, notifications, messages

Revision ID: a1b2c3d4e5f6
Revises: 4e51e82492b2
Create Date: 2026-07-17 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "a1b2c3d4e5f6"
down_revision = "4e51e82492b2"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("booklists", schema=None) as batch_op:
        batch_op.add_column(sa.Column("fulfillment_type", sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column("notes", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("share_token", sa.String(length=64), nullable=True))
        batch_op.create_index(batch_op.f("ix_booklists_share_token"), ["share_token"], unique=True)

    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(length=50), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("booklist_id", sa.Integer(), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["booklist_id"], ["booklists.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("notifications", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_notifications_booklist_id"), ["booklist_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_notifications_user_id"), ["user_id"], unique=False)

    op.create_table(
        "messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("sender_role", sa.String(length=20), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("messages", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_messages_user_id"), ["user_id"], unique=False)


def downgrade():
    with op.batch_alter_table("messages", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_messages_user_id"))
    op.drop_table("messages")

    with op.batch_alter_table("notifications", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_notifications_user_id"))
        batch_op.drop_index(batch_op.f("ix_notifications_booklist_id"))
    op.drop_table("notifications")

    with op.batch_alter_table("booklists", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_booklists_share_token"))
        batch_op.drop_column("share_token")
        batch_op.drop_column("notes")
        batch_op.drop_column("fulfillment_type")
