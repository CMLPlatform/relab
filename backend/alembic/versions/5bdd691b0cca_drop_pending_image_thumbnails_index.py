"""drop the index over image rows with an unverified thumbnail set

Revision ID: 5bdd691b0cca
Revises: e2a7c4d1b930
Create Date: 2026-09-27

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5bdd691b0cca"
down_revision: str | None = "e2a7c4d1b930"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# upgrade() drops one index and nothing else; downgrade rebuilds it. No data to lose.
ROLLBACK_SAFE = True

_INDEX = "ix_image_thumbnails_pending"


def upgrade() -> None:
    """Drop the partial index; uploads now write every thumbnail width inline."""
    # Its own revision, ahead of the column drop, so the drop runs CONCURRENTLY and never
    # holds a lock over `image` that blocks writes. if_exists makes a re-run after a lost
    # revision stamp a no-op instead of a failure.
    with op.get_context().autocommit_block():
        op.drop_index(_INDEX, table_name="image", postgresql_concurrently=True, if_exists=True)


def downgrade() -> None:
    """Rebuild the partial index concurrently."""
    # NOTE: a build that dies leaves an INVALID index of this name; drop it
    # concurrently and re-run, as for e2a7c4d1b930.
    with op.get_context().autocommit_block():
        op.create_index(
            _INDEX,
            "image",
            ["id"],
            postgresql_where=sa.text("thumbnails_generated_at IS NULL"),
            postgresql_concurrently=True,
        )
