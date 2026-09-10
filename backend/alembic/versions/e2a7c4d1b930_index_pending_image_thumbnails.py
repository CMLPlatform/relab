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
    # The index commits inside the autocommit block below, and the revision is stamped
    # after it. A process that dies in that window leaves the index built and this
    # revision unstamped, and every later run then fails on the name -- which stops the
    # migrator, and with it the API, on a schema that is already correct.
    #
    # So ask what the name holds before building. Only a VALID index is adopted: it is
    # this revision's own finished work, and returning here lets the stamp land. An
    # INVALID one falls through to CREATE INDEX and raises, which is the point (see
    # below). A read commits nothing, so it is safe ahead of the autocommit block.
    existing = (
        op.get_bind()
        .execute(
            sa.text("SELECT indisvalid FROM pg_index WHERE indexrelid = to_regclass(:name)"),
            {"name": _INDEX},
        )
        .scalar()
    )
    if existing is True:
        return
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
    # The same raise covers a second state, which the query above reports as clean: the
    # build finished and committed, and the process died before the revision was stamped.
    # The index is then VALID and correct, and every re-run still fails on the name. The
    # recovery differs -- dropping and re-running re-derives the state, `alembic stamp`
    # asserts it -- so DEPLOY-PROD.md Part 3 carries both. Until the stamp lands the
    # migrator exits non-zero and the API never starts, so this is an outage, not a
    # nuisance.
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
