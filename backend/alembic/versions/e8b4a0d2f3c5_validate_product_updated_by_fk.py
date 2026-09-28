"""validate the product last-editor foreign key

Revision ID: e8b4a0d2f3c5
Revises: d7a3f9c1e2b4
Create Date: 2026-09-28

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e8b4a0d2f3c5"
down_revision: str | None = "d7a3f9c1e2b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Validation changes no data, and a validated constraint is only dropped by the revision below.
ROLLBACK_SAFE = True


def upgrade() -> None:
    """Validate existing rows under SHARE UPDATE EXCLUSIVE, which does not block writes."""
    op.execute("ALTER TABLE product VALIDATE CONSTRAINT product_updated_by_id_fkey")


def downgrade() -> None:
    """Nothing to undo: validation only checked existing rows."""
