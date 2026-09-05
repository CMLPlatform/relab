"""validate the image dimensions check

Revision ID: 7c1f3b6a52d8
Revises: 34345aa9c369
Create Date: 2026-08-18 10:20:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7c1f3b6a52d8"
down_revision: str | None = "34345aa9c369"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Promote ck_image_dimensions_positive from NOT VALID to validated.

    Its own revision so a retry never re-runs the DDL of the one that added the
    constraint. VALIDATE reads the whole table under SHARE UPDATE EXCLUSIVE, so
    writes keep flowing while it scans; the statement ceiling is raised because
    that scan, not a lock wait, is what could exceed env.py's default.
    """
    op.execute("SET LOCAL lock_timeout = '3s'")
    op.execute("SET LOCAL statement_timeout = '15min'")
    op.execute("ALTER TABLE image VALIDATE CONSTRAINT ck_image_dimensions_positive")


def downgrade() -> None:
    """No-op: a validated constraint cannot be un-validated, only dropped.

    Dropping it belongs to the revision that created it, so rolling back to
    there removes the constraint entirely.
    """
