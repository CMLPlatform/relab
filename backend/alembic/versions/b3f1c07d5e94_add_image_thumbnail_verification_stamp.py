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

# upgrade() only adds a nullable column and an index; it destroys nothing, so a rollback
# to the previous revision loses no data that was there before it ran.
ROLLBACK_SAFE = True

_INDEX = "ix_image_thumbnails_pending"


def upgrade() -> None:
    """Add the stamp and the partial index the backfill selects on."""
    # A nullable column with no default is a catalogue-only change on PG11+: no table
    # rewrite, so the ACCESS EXCLUSIVE lock is held for microseconds.
    op.add_column("image", sa.Column("thumbnails_generated_at", sa.DateTime(timezone=True), nullable=True))

    # CONCURRENTLY cannot run inside a transaction, and the whole revision is one
    # transaction, so this needs its own autocommit block. Every existing row matches the
    # predicate at first — that is intended: the first backfill verifies and stamps them,
    # and the index shrinks to the stragglers from then on.
    with op.get_context().autocommit_block():
        op.create_index(
            _INDEX,
            "image",
            ["id"],
            postgresql_where=sa.text("thumbnails_generated_at IS NULL"),
            postgresql_concurrently=True,
            if_not_exists=True,
        )


def downgrade() -> None:
    """Drop the index and the column."""
    with op.get_context().autocommit_block():
        op.drop_index(_INDEX, table_name="image", postgresql_concurrently=True, if_exists=True)
    op.drop_column("image", "thumbnails_generated_at")
