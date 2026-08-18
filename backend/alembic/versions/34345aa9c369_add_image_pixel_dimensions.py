"""add image pixel dimensions

Revision ID: 34345aa9c369
Revises: d4b8e1c60a72
Create Date: 2026-08-18 10:13:40.740042

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "34345aa9c369"
down_revision: str | None = "d4b8e1c60a72"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Record the stored pixel size of an image, so clients can size and reserve it.

    Both columns are nullable with no default, which is metadata-only on PG 11+:
    no rewrite, no scan. Existing rows stay NULL until the backfill
    (``scripts.maintenance.backfill_image_dimensions``) measures them; rows whose
    file cannot be read stay NULL.

    The CHECK goes on NOT VALID so it applies to new rows without the
    ACCESS EXCLUSIVE scan of the existing ones; the next revision validates it
    under SHARE UPDATE EXCLUSIVE, which does not block writes.
    """
    op.execute("SET LOCAL lock_timeout = '3s'")
    op.execute("SET LOCAL statement_timeout = '30s'")

    op.add_column("image", sa.Column("width_px", sa.Integer(), nullable=True))
    op.add_column("image", sa.Column("height_px", sa.Integer(), nullable=True))
    op.execute(
        "ALTER TABLE image ADD CONSTRAINT ck_image_dimensions_positive "
        "CHECK ((width_px IS NULL OR width_px > 0) AND (height_px IS NULL OR height_px > 0)) NOT VALID"
    )


def downgrade() -> None:
    """Drop the constraint before the columns it references.

    The deployed API writes both columns on every upload, so roll the API back
    to the release before this revision first, or uploads fail on the missing
    columns.
    """
    op.execute("SET LOCAL lock_timeout = '3s'")
    op.drop_constraint("ck_image_dimensions_positive", "image", type_="check")
    op.drop_column("image", "height_px")
    op.drop_column("image", "width_px")
