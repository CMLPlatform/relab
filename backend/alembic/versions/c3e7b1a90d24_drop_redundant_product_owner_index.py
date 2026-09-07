"""Drop the redundant partial index on product.owner_id.

``ix_product_base_owner_id`` indexes ``owner_id WHERE parent_id IS NULL``, which is a
strict subset of ``ix_product_owner_id`` on the same column. The full index answers the
same base-product listings (with ``ix_product_parent_id`` available for the role filter),
so the partial one only bought a smaller scan in exchange for a second index write on
every product insert, update, and delete.

Uses ``DROP INDEX CONCURRENTLY``: a plain drop takes ACCESS EXCLUSIVE on ``product``,
which is the busiest table in the schema.

Revision ID: c3e7b1a90d24
Revises: bfd99abac57f
Create Date: 2026-08-17 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3e7b1a90d24"
down_revision: str | None = "bfd99abac57f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEX_NAME = "ix_product_base_owner_id"


def upgrade() -> None:
    # NOTE: CONCURRENTLY cannot run inside a transaction, and a failure here leaves nothing
    # to roll back, so this block holds exactly one statement.
    with op.get_context().autocommit_block():
        op.drop_index(INDEX_NAME, table_name="product", postgresql_concurrently=True, if_exists=True)


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.create_index(
            INDEX_NAME,
            "product",
            ["owner_id"],
            postgresql_where=sa.text("parent_id IS NULL"),
            postgresql_concurrently=True,
            if_not_exists=True,
        )
