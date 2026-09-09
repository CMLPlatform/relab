"""index the image rows whose thumbnail set is unverified

Revision ID: e2a7c4d1b930
Revises: b3f1c07d5e94
Create Date: 2026-09-09

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e2a7c4d1b930"
down_revision: str | None = "b3f1c07d5e94"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# upgrade() creates one index and nothing else; downgrade drops it. No data to lose.
ROLLBACK_SAFE = True

_INDEX = "ix_image_thumbnails_pending"


def upgrade() -> None:
    """Build the partial index the thumbnail backfill selects through."""
    # This revision contains nothing but the index on purpose. CONCURRENTLY cannot run
    # inside a transaction, and entering an autocommit block commits whatever the revision
    # did before it, so any other statement here would be committed under a revision that
    # a failed build then leaves unstamped. Alone, a failure re-runs from a consistent,
    # stamped state.
    #
    # The build takes a SHARE UPDATE EXCLUSIVE lock and then waits out the transactions
    # already open, both under env.py's lock_timeout/statement_timeout, so one long-running
    # upload transaction is enough to abort it. That is the expected outcome: re-run.
    #
    # No if_not_exists: a build that dies after writing the catalogue entry leaves an
    # INVALID index of this name, which the planner never uses while every write still
    # maintains it. Matching it by name would adopt that corpse and stamp the revision as
    # done. Raising instead is what surfaces it. Drop it and re-run:
    #   SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
    #   DROP INDEX CONCURRENTLY ix_image_thumbnails_pending;
    #
    # Every existing row matches the predicate at first. That is intended: the first
    # backfill verifies and stamps them, and the index shrinks to the stragglers from then
    # on.
    with op.get_context().autocommit_block():
        op.create_index(
            _INDEX,
            "image",
            ["id"],
            postgresql_where=sa.text("thumbnails_generated_at IS NULL"),
            postgresql_concurrently=True,
        )


def downgrade() -> None:
    """Drop the index, including an INVALID one a failed build left behind."""
    with op.get_context().autocommit_block():
        op.drop_index(_INDEX, table_name="image", postgresql_concurrently=True, if_exists=True)
