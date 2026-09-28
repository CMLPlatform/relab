"""add product edit version

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


def upgrade() -> None:
    """Add the concurrency token."""
    # A constant default is stored as metadata since PG 11: no table rewrite.
    op.add_column("product", sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False))


def downgrade() -> None:
    """Drop the version column."""
    op.drop_column("product", "version")
