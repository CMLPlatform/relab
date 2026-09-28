"""promote superusers to the lab tier and require it from now on

Revision ID: c4e1a9d2f7b3
Revises: 9ae7fb3b154c
Create Date: 2026-09-28

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4e1a9d2f7b3"
down_revision: str | None = "9ae7fb3b154c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# downgrade() drops the constraint and keeps the promotions: a superuser left on the lab
# tier is what the previous release allowed, so nothing it relied on is lost.
ROLLBACK_SAFE = True

_CONSTRAINT = "ck_user_superuser_is_lab"


def upgrade() -> None:
    """Promote existing superusers, then require the lab tier for new ones."""
    op.execute("""UPDATE "user" SET role = 'lab' WHERE is_superuser AND role <> 'lab'""")
    # NOT VALID skips the scan under the table lock; c9d5e3f1a7b2 validates it.
    op.execute(
        f"""ALTER TABLE "user" ADD CONSTRAINT {_CONSTRAINT} CHECK (NOT is_superuser OR role = 'lab') NOT VALID"""
    )


def downgrade() -> None:
    """Drop the constraint; promoted superusers stay on the lab tier."""
    op.execute(f"""ALTER TABLE "user" DROP CONSTRAINT IF EXISTS {_CONSTRAINT}""")
