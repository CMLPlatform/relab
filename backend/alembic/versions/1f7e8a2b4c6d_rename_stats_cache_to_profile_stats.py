"""rename_stats_cache_to_profile_stats

Revision ID: 1f7e8a2b4c6d
Revises: e8f9a0b1c2d3
Create Date: 2026-04-25 13:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1f7e8a2b4c6d"
down_revision: str | None = "e8f9a0b1c2d3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("user", "stats_cache", new_column_name="profile_stats")
    op.add_column("user", sa.Column("profile_stats_computed_at", sa.TIMESTAMP(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("user", "profile_stats_computed_at")
    op.alter_column("user", "profile_stats", new_column_name="stats_cache")
