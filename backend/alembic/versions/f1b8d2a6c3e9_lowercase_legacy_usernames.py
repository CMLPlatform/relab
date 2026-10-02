"""lowercase usernames stored before input normalization

Revision ID: f1b8d2a6c3e9
Revises: d7a3f9c1e2b4
Create Date: 2026-10-02

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f1b8d2a6c3e9"
down_revision: str | None = "d7a3f9c1e2b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# downgrade() keeps the lowercased names: the previous release already lowercases every
# username lookup, so it only ever matched these rows in their lowercase form.
ROLLBACK_SAFE = True


def upgrade() -> None:
    """Lowercase mixed-case usernames so profile, login and listing lookups match them.

    A row whose lowercase form another account already holds is left as is rather than
    failing the unique index.
    """
    op.execute(
        """
        UPDATE "user" AS u SET username = lower(u.username)
        WHERE u.username <> lower(u.username)
          AND NOT EXISTS (
            SELECT 1 FROM "user" AS o WHERE o.id <> u.id AND lower(o.username) = lower(u.username)
          )
        """
    )


def downgrade() -> None:
    """Keep the lowercased usernames."""
