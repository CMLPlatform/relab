"""Trigram-index producttype.description for fuzzy label search.

For CPV product types ``name`` is the code and ``description`` carries the
label, so ``ProductTypeFilter.trigram_columns`` now fuzzy-matches both. The
``%`` operator on an unindexed column is a sequential scan with a similarity
computation per row, hence the index.

NOTE: plain CREATE INDEX (ShareLock, blocks writes to producttype while it
builds), same trade-off as d4b8e1c60a72; the table is small and rarely
written.

Revision ID: b7e2d9a4c1f0
Revises: 7c1f3b6a52d8
Create Date: 2026-08-18 12:00:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "b7e2d9a4c1f0"
down_revision: str | None = "7c1f3b6a52d8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '3s'")
    op.execute(
        "CREATE INDEX IF NOT EXISTS producttype_description_trgm_idx "
        "ON producttype USING GIN (description gin_trgm_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS producttype_description_trgm_idx")
