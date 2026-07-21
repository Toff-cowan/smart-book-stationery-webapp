"""product grade tags for catalog filtering

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-07-20 11:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "f6a7b8c9d0e1"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "product_grades",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("grade", sa.String(length=80), nullable=False),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("product_id", "grade", name="uq_product_grade"),
    )
    op.create_index(
        "ix_product_grades_product_id",
        "product_grades",
        ["product_id"],
        unique=False,
    )
    op.create_index(
        "ix_product_grades_grade",
        "product_grades",
        ["grade"],
        unique=False,
    )


def downgrade():
    op.drop_index("ix_product_grades_grade", table_name="product_grades")
    op.drop_index("ix_product_grades_product_id", table_name="product_grades")
    op.drop_table("product_grades")
