"""Add FK indexes on materialproductlink association table.

Revision ID: 591bfc225c05
Revises: a3fbac86fbbb
Create Date: 2026-05-13 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "591bfc225c05"
down_revision: str | None = "a3fbac86fbbb"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_materialproductlink_material_id",
        "materialproductlink",
        ["material_id"],
        if_not_exists=True,
    )
    op.create_index(
        "ix_materialproductlink_product_id",
        "materialproductlink",
        ["product_id"],
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index("ix_materialproductlink_material_id", table_name="materialproductlink", if_exists=True)
    op.drop_index("ix_materialproductlink_product_id", table_name="materialproductlink", if_exists=True)
