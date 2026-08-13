"""add credit_in_releases

Revision ID: db400147aa2f
Revises: f1a2b3c4d5e6
Create Date: 2026-08-13 15:14:27.646690

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "db400147aa2f"
down_revision: str | None = "f1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # server_default, not a plain default: existing rows must land on false rather than NULL.
    op.add_column("user", sa.Column("credit_in_releases", sa.Boolean(), server_default="false", nullable=False))


def downgrade() -> None:
    op.drop_column("user", "credit_in_releases")
