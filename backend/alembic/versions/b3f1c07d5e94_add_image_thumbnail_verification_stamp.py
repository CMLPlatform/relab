"""add image thumbnail verification stamp

Revision ID: b3f1c07d5e94
Revises: 4a672549f270
Create Date: 2026-09-09

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b3f1c07d5e94"
down_revision: str | None = "4a672549f270"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# upgrade() only adds a nullable column; it destroys nothing, so a rollback to the previous
# revision loses no data that was there before it ran.
ROLLBACK_SAFE = True


def upgrade() -> None:
    """Add the stamp the thumbnail backfill selects on."""
    # A nullable column with no default is a catalogue-only change on PG11+: no table
    # rewrite, so the ACCESS EXCLUSIVE lock is held for microseconds.
    #
    # The partial index over this column is a revision of its own (e2a7c4d1b930), not the
    # tail of this one. CREATE INDEX CONCURRENTLY needs an autocommit block, and Alembic
    # commits the surrounding transaction on entering one, which would commit this column
    # while the revision is still unstamped. A concurrent build that then loses its race
    # for the lock leaves the column applied and the revision not recorded, and every later
    # `alembic upgrade head` dies re-adding a column that is already there.
    op.add_column("image", sa.Column("thumbnails_generated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Drop the column."""
    op.drop_column("image", "thumbnails_generated_at")
