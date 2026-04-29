"""remove newsletter subscribers

Revision ID: 9b7f3c1b4a2d
Revises: 244aa961ea6e
Create Date: 2026-04-28 20:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9b7f3c1b4a2d"
down_revision: str | None = "244aa961ea6e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index(op.f("ix_newslettersubscriber_email"), table_name="newslettersubscriber")
    op.drop_table("newslettersubscriber")


def downgrade() -> None:
    op.create_table(
        "newslettersubscriber",
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("is_confirmed", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_newslettersubscriber_email"), "newslettersubscriber", ["email"], unique=True)
