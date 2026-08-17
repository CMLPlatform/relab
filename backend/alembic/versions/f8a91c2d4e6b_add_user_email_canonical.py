"""add user email canonical

Revision ID: f8a91c2d4e6b
Revises: e5f6a7b8c9d0
Create Date: 2026-05-01 00:00:00.000000

"""

import unicodedata
from collections import Counter
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from email_validator import EmailNotValidError, validate_email

# revision identifiers, used by Alembic.
revision: str = "f8a91c2d4e6b"
down_revision: str | None = "e5f6a7b8c9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _canonicalize_email(email: str) -> str:
    try:
        validated = validate_email(email, check_deliverability=False)
    except EmailNotValidError as exc:
        msg = "Existing user email is not valid enough to canonicalize."
        raise RuntimeError(msg) from exc
    local_part = unicodedata.normalize("NFC", validated.local_part).casefold()
    domain = (validated.ascii_domain or validated.domain).casefold()
    return f"{local_part}@{domain}"


def upgrade() -> None:
    op.add_column("user", sa.Column("email_canonical", sa.String(), nullable=True))

    connection = op.get_bind()
    rows = connection.execute(sa.text('SELECT id, email FROM "user"')).mappings().all()
    canonical_by_user_id = {row["id"]: _canonicalize_email(row["email"]) for row in rows}

    counts = Counter(canonical_by_user_id.values())
    collisions = sum(1 for count in counts.values() if count > 1)
    if collisions:
        # NOTE: count only. The addresses themselves are personal data and this runs in the
        # migrations container, so anything in the message lands in the deploy log.
        msg = (
            f"Cannot add user.email_canonical: {collisions} canonical address(es) are shared by more than one "
            "user. Merge or remove the duplicate accounts, then re-run the migration."
        )
        raise RuntimeError(msg)

    # ponytail: a round-trip per user. Fine at this table's scale; batch it if the user
    # count ever reaches the thousands, since this holds a lock for the whole loop.
    for user_id, canonical_email in canonical_by_user_id.items():
        connection.execute(
            sa.text('UPDATE "user" SET email_canonical = :email_canonical WHERE id = :user_id'),
            {"email_canonical": canonical_email, "user_id": user_id},
        )

    op.alter_column("user", "email_canonical", nullable=False)
    op.create_index(op.f("ix_user_email_canonical"), "user", ["email_canonical"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_user_email_canonical"), table_name="user")
    op.drop_column("user", "email_canonical")
