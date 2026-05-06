"""Remove stored login IP address.

Revision ID: 2d0b44bd7af2
Revises: eddf31f2e90c
Create Date: 2026-05-06 11:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "2d0b44bd7af2"
down_revision: str | None = "eddf31f2e90c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Drop retained login IP addresses."""
    op.drop_column("user", "last_login_ip")


def downgrade() -> None:
    """Restore the removed column for downgrade-only schema reversibility."""
    op.add_column("user", sa.Column("last_login_ip", sa.String(45), nullable=True))
