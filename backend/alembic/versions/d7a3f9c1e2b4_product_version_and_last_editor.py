"""add product version and last editor

Revision ID: d7a3f9c1e2b4
Revises: c9d5e3f1a7b2
Create Date: 2026-09-28

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d7a3f9c1e2b4"
down_revision: str | None = "c9d5e3f1a7b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_FK = "product_updated_by_id_fkey"


def upgrade() -> None:
    """Add the concurrency token and the last-editor column."""
    # A constant default is stored as metadata since PG 11: no table rewrite.
    op.add_column("product", sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False))
    op.add_column("product", sa.Column("updated_by_id", sa.Uuid(), nullable=True))
    # NOT VALID skips the scan under the table lock; e8b4a0d2f3c5 validates it.
    op.create_foreign_key(
        _FK, "product", "user", ["updated_by_id"], ["id"], ondelete="SET NULL", postgresql_not_valid=True
    )


def downgrade() -> None:
    """Drop the new product columns."""
    op.drop_constraint(_FK, "product", type_="foreignkey")
    op.drop_column("product", "updated_by_id")
    op.drop_column("product", "version")
