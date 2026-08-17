"""add terms acceptance tracking

Revision ID: bfd99abac57f
Revises: f1a2b3c4d5e6
Create Date: 2026-08-13 16:34:43.771525

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "bfd99abac57f"
down_revision: str | None = "f1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Nullable with no server_default on purpose: existing accounts accepted nothing, and
    # backfilling any value here would fabricate evidence of a grant that was never made.
    op.add_column("user", sa.Column("terms_accepted_version", sa.Integer(), nullable=True))
    op.add_column("user", sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("user", "terms_accepted_at")
    op.drop_column("user", "terms_accepted_version")
