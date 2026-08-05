"""Tighten quantity/amount CHECK constraints and drop a redundant index.

``materialproductlink.quantity`` and ``product.amount_in_parent`` were only
constrained to be non-null; zero and negative values passed silently. Fold
``amount_in_parent > 0`` into the existing ``product_role_invariants`` CHECK
and add a matching positive-quantity CHECK on ``materialproductlink``.

Also drops ``ix_materialproductlink_material_id``: the table's primary key is
``(material_id, product_id)``, so the index is redundant with the PK's
leading column (see the sibling link tables in reference_data/models.py for
the same precedent).

Revision ID: f1a2b3c4d5e6
Revises: d1e2f3a4b5c6
Create Date: 2026-08-05 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "f1a2b3c4d5e6"
down_revision: str | None = "d1e2f3a4b5c6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PRODUCT_ROLE_CHECK = "product_role_invariants"
MATERIAL_QUANTITY_CHECK = "ck_materialproductlink_quantity_positive"
MATERIAL_ID_INDEX = "ix_materialproductlink_material_id"


def upgrade() -> None:
    op.drop_constraint(PRODUCT_ROLE_CHECK, "product", type_="check")
    op.create_check_constraint(
        PRODUCT_ROLE_CHECK,
        "product",
        "(parent_id IS NULL AND amount_in_parent IS NULL) "
        "OR (parent_id IS NOT NULL AND amount_in_parent IS NOT NULL AND amount_in_parent > 0)",
    )
    op.create_check_constraint(MATERIAL_QUANTITY_CHECK, "materialproductlink", "quantity > 0")
    op.drop_index(MATERIAL_ID_INDEX, table_name="materialproductlink")


def downgrade() -> None:
    op.create_index(MATERIAL_ID_INDEX, "materialproductlink", ["material_id"])
    op.drop_constraint(MATERIAL_QUANTITY_CHECK, "materialproductlink", type_="check")
    op.drop_constraint(PRODUCT_ROLE_CHECK, "product", type_="check")
    op.create_check_constraint(
        PRODUCT_ROLE_CHECK,
        "product",
        "(parent_id IS NULL AND amount_in_parent IS NULL) OR (parent_id IS NOT NULL AND amount_in_parent IS NOT NULL)",
    )
