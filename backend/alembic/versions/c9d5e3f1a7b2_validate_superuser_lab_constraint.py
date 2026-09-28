"""validate the superuser lab-tier constraint

Revision ID: c9d5e3f1a7b2
Revises: c4e1a9d2f7b3
Create Date: 2026-09-28

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c9d5e3f1a7b2"
down_revision: str | None = "c4e1a9d2f7b3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Validation changes no data, and a validated constraint is only dropped by the revision below.
ROLLBACK_SAFE = True


def upgrade() -> None:
    """Validate existing rows under SHARE UPDATE EXCLUSIVE, which does not block writes."""
    op.execute("""ALTER TABLE "user" VALIDATE CONSTRAINT ck_user_superuser_is_lab""")


def downgrade() -> None:
    """Nothing to undo: validation only checked existing rows."""
