"""drop credit_in_releases

Revision ID: 9a6eb97040c2
Revises: bfd99abac57f
Create Date: 2026-08-13 18:47:03.273616

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9a6eb97040c2"
down_revision: str | None = "bfd99abac57f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Per-contributor release credit was dropped in favour of collective attribution, which
    # is what CC BY actually needs. A forward migration rather than an edit to db400147aa2f:
    # dev databases already sit at that revision and would not converge otherwise.
    op.drop_column("user", "credit_in_releases")


def downgrade() -> None:
    # Restores the column as db400147aa2f created it, server_default included, so existing
    # rows come back as false rather than NULL against the NOT NULL constraint.
    op.add_column(
        "user",
        sa.Column("credit_in_releases", sa.BOOLEAN(), server_default=sa.text("false"), nullable=False),
    )
