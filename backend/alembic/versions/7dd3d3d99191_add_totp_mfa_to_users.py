"""Add TOTP MFA fields to users."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "7dd3d3d99191"
down_revision: str | None = "c9d0e1f2a3b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add encrypted TOTP storage and enrollment state."""
    op.add_column("user", sa.Column("mfa_totp_secret", sa.String(), nullable=True))
    op.add_column("user", sa.Column("mfa_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("user", sa.Column("mfa_confirmed_at", sa.DateTime(timezone=True), nullable=True))
    op.alter_column("user", "mfa_enabled", server_default=None)


def downgrade() -> None:
    """Remove TOTP MFA storage and enrollment state."""
    op.drop_column("user", "mfa_confirmed_at")
    op.drop_column("user", "mfa_enabled")
    op.drop_column("user", "mfa_totp_secret")
