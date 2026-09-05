"""Remove product dismantling time fields

Revision ID: e5f6a7b8c9d0
Revises: c7d8e9f0a1b2
Create Date: 2026-04-29 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e5f6a7b8c9d0"
down_revision: str | None = "c7d8e9f0a1b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("product", "dismantling_time_end")
    op.drop_column("product", "dismantling_time_start")


def downgrade() -> None:
    op.add_column(
        "product",
        sa.Column(
            "dismantling_time_start",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.alter_column("product", "dismantling_time_start", server_default=None)
    op.add_column("product", sa.Column("dismantling_time_end", sa.TIMESTAMP(timezone=True), nullable=True))
