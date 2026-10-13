"""rename the anonymous system account to the r9lab address

Revision ID: 0b5e7c3a9d21
Revises: f1b8d2a6c3e9
Create Date: 2026-10-13

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0b5e7c3a9d21"
down_revision: str | None = "f1b8d2a6c3e9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# downgrade() renames the account back, and a merge only moves product ownership between
# two system accounts with the same role, so rolling back loses nothing either code reads.
ROLLBACK_SAFE = True

# Literals, not app imports: a revision must keep meaning what it meant when it shipped.
OLD_EMAIL = "anonymous@system.relab.internal"
NEW_EMAIL = "anonymous@system.r9lab.internal"


def _move_account(source: str, target: str) -> None:
    """Give the system account at ``source`` the address ``target``.

    When a row already holds ``target`` (code that knows the new address ran first), its
    products move to the ``source`` row, its upload counters are added there, and it is
    deleted, so the unique ``email`` and ``email_canonical`` indexes hold. The profile
    stats cache is cleared so the next read recomputes it.
    """
    for statement in (
        """
        UPDATE product SET owner_id = s.id
        FROM "user" AS s, "user" AS t
        WHERE s.email_canonical = :source AND t.email_canonical = :target
          AND product.owner_id = t.id
        """,
        """
        UPDATE "user" AS s
        SET upload_file_count = s.upload_file_count + t.upload_file_count,
            upload_total_bytes = s.upload_total_bytes + t.upload_total_bytes,
            profile_stats = '{}'::jsonb,
            profile_stats_computed_at = NULL
        FROM "user" AS t
        WHERE s.email_canonical = :source AND t.email_canonical = :target
        """,
        """
        DELETE FROM "user" AS t
        WHERE t.email_canonical = :target
          AND EXISTS (SELECT 1 FROM "user" AS s WHERE s.email_canonical = :source)
        """,
        'UPDATE "user" SET email = :target, email_canonical = :target WHERE email_canonical = :source',
    ):
        op.execute(sa.text(statement).bindparams(source=source, target=target))


def upgrade() -> None:
    """Move the anonymous system account to the r9lab address."""
    _move_account(OLD_EMAIL, NEW_EMAIL)


def downgrade() -> None:
    """Move the anonymous system account back to the relab address."""
    _move_account(NEW_EMAIL, OLD_EMAIL)
