"""Consolidate File/Image parent FK columns into generic parent_id

Replace the three nullable foreign-key columns (product_id, material_id,
product_type_id) on ``file`` and ``image`` with a single ``parent_id``
integer column.  Referential integrity moves to the application layer;
a composite index on (parent_type, parent_id) preserves query performance.

Revision ID: c4d5e6f7a8b9
Revises: b7c1d2e3f4a5
Create Date: 2026-04-08 14:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4d5e6f7a8b9"
down_revision: str | None = "b7c1d2e3f4a5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for table in ("file", "image"):
        # 1. Add parent_id (nullable initially so we can populate it)
        op.add_column(table, sa.Column("parent_id", sa.Integer(), nullable=True))

    # 2. Populate parent_id from whichever FK column is set (per-table literals, no f-strings)
    op.execute(sa.text("UPDATE file SET parent_id = COALESCE(product_id, material_id, product_type_id)"))
    op.execute(sa.text("UPDATE image SET parent_id = COALESCE(product_id, material_id, product_type_id)"))

    for table in ("file", "image"):
        # 3. Make parent_id NOT NULL
        op.alter_column(table, "parent_id", nullable=False)

        # 4. Drop old FK constraints then columns
        op.drop_constraint(f"{table}_product_id_fkey", table, type_="foreignkey")
        op.drop_constraint(f"{table}_material_id_fkey", table, type_="foreignkey")
        op.drop_constraint(f"{table}_product_type_id_fkey", table, type_="foreignkey")
        op.drop_column(table, "product_id")
        op.drop_column(table, "material_id")
        op.drop_column(table, "product_type_id")

        # 5. Add composite index for efficient parent lookups
        op.create_index(f"ix_{table}_parent_type_parent_id", table, ["parent_type", "parent_id"])


def downgrade() -> None:
    for table in ("file", "image"):
        # 1. Drop composite index
        op.drop_index(f"ix_{table}_parent_type_parent_id", table_name=table)

        # 2. Re-add old FK columns (nullable)
        op.add_column(table, sa.Column("product_id", sa.Integer(), nullable=True))
        op.add_column(table, sa.Column("material_id", sa.Integer(), nullable=True))
        op.add_column(table, sa.Column("product_type_id", sa.Integer(), nullable=True))

    # 3. Populate old FK columns from parent_id + parent_type (per-table literals, no f-strings)
    op.execute(sa.text("UPDATE file SET product_id = parent_id WHERE parent_type = 'PRODUCT'"))
    op.execute(sa.text("UPDATE file SET material_id = parent_id WHERE parent_type = 'MATERIAL'"))
    op.execute(sa.text("UPDATE file SET product_type_id = parent_id WHERE parent_type = 'PRODUCT_TYPE'"))
    op.execute(sa.text("UPDATE image SET product_id = parent_id WHERE parent_type = 'PRODUCT'"))
    op.execute(sa.text("UPDATE image SET material_id = parent_id WHERE parent_type = 'MATERIAL'"))
    op.execute(sa.text("UPDATE image SET product_type_id = parent_id WHERE parent_type = 'PRODUCT_TYPE'"))

    for table in ("file", "image"):
        # 4. Re-add FK constraints
        op.create_foreign_key(f"{table}_product_id_fkey", table, "product", ["product_id"], ["id"])
        op.create_foreign_key(f"{table}_material_id_fkey", table, "material", ["material_id"], ["id"])
        op.create_foreign_key(f"{table}_product_type_id_fkey", table, "producttype", ["product_type_id"], ["id"])

        # 5. Drop parent_id
        op.drop_column(table, "parent_id")
