"""Add upload size metadata to stored media.

Revision ID: 7a6d4e8f9b10
Revises: 2d0b44bd7af2
Create Date: 2026-05-12 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "7a6d4e8f9b10"
down_revision: str | None = "2d0b44bd7af2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Store upload byte-size metadata and index product owners for quota checks."""
    op.add_column("file", sa.Column("upload_size_bytes", sa.Integer(), server_default="0", nullable=False))
    op.add_column("image", sa.Column("upload_size_bytes", sa.Integer(), server_default="0", nullable=False))
    op.create_index("ix_product_owner_id", "product", ["owner_id"])


def downgrade() -> None:
    """Remove upload byte-size metadata and quota helper index."""
    op.drop_index("ix_product_owner_id", table_name="product")
    op.drop_column("image", "upload_size_bytes")
    op.drop_column("file", "upload_size_bytes")
