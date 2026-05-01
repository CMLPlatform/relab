"""add user email canonical

Revision ID: f8a91c2d4e6b
Revises: e5f6a7b8c9d0
Create Date: 2026-05-01 00:00:00.000000

"""

import unicodedata
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

    seen: dict[str, str] = {}
    collisions: set[str] = set()
    for user_id, canonical_email in canonical_by_user_id.items():
        if canonical_email in seen:
            collisions.add(canonical_email)
        seen[canonical_email] = str(user_id)
    if collisions:
        collision_list = ", ".join(sorted(collisions))
        msg = f"Cannot add user.email_canonical; existing users collide after canonicalization: {collision_list}"
        raise RuntimeError(msg)

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
