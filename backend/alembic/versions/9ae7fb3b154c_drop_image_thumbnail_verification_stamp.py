"""drop the image thumbnail verification stamp

Revision ID: 9ae7fb3b154c
Revises: 5bdd691b0cca
Create Date: 2026-09-27

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9ae7fb3b154c"
down_revision: str | None = "5bdd691b0cca"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# upgrade() drops a column that only recorded whether a row's thumbnails had been
# checked. A rollback re-adds it as NULL, which the previous release reads as "check
# again", so nothing it relied on is lost.
ROLLBACK_SAFE = True


def upgrade() -> None:
    """Drop the stamp; no thumbnail work is left outstanding after an upload."""
    # DROP COLUMN is catalogue-only: the ACCESS EXCLUSIVE lock is held for microseconds,
    # and env.py's lock_timeout bounds the wait for it.
    op.drop_column("image", "thumbnails_generated_at")


def downgrade() -> None:
    """Re-add the nullable column (catalogue-only, no table rewrite)."""
    op.add_column("image", sa.Column("thumbnails_generated_at", sa.DateTime(timezone=True), nullable=True))
