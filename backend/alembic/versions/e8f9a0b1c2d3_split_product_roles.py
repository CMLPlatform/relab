"""Split base products and components at the DB level.

Base products and components share the ``product`` table, discriminated by
``parent_id``. Before this migration the role distinction was enforced only
in application code.

After this migration:
- Base products have ``parent_id IS NULL`` and ``amount_in_parent IS NULL``.
- Components have    ``parent_id IS NOT NULL`` and ``amount_in_parent IS NOT NULL``.
A CHECK constraint enforces the role shape. ``owner_id`` remains NOT NULL on
every row (components denormalize their root base product's owner so
ownership checks, stats, and per-owner listings stay O(1) with existing
indexes); Pydantic read schemas decide which role's fields get exposed.

Revision ID: e8f9a0b1c2d3
Revises: 6f2b9e4a1c3d
Create Date: 2026-04-24 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e8f9a0b1c2d3"
down_revision: str | None = "6f2b9e4a1c3d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PRODUCT_ROLE_CHECK = "product_role_invariants"
PRODUCT_BASE_OWNER_IDX = "ix_product_base_owner_id"


def upgrade() -> None:
    op.create_check_constraint(
        PRODUCT_ROLE_CHECK,
        "product",
        "(parent_id IS NULL AND amount_in_parent IS NULL) OR (parent_id IS NOT NULL AND amount_in_parent IS NOT NULL)",
    )
    op.create_index(
        PRODUCT_BASE_OWNER_IDX,
        "product",
        ["owner_id"],
        postgresql_where=sa.text("parent_id IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(PRODUCT_BASE_OWNER_IDX, table_name="product")
    op.drop_constraint(PRODUCT_ROLE_CHECK, "product", type_="check")
