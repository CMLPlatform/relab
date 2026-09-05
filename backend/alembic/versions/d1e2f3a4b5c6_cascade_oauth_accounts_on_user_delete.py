"""Cascade OAuth account rows when their user is deleted.

``oauthaccount.user_id`` is NOT NULL, so the plain NO ACTION foreign key made
every user who ever signed in with Google or GitHub undeletable. The ORM
relationship now cascades too; this keeps the database honest on its own.

Revision ID: d1e2f3a4b5c6
Revises: b2c9e4d7a013
Create Date: 2026-08-05 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "d1e2f3a4b5c6"
down_revision: str | None = "b2c9e4d7a013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FK_NAME = "oauthaccount_user_id_fkey"


def upgrade() -> None:
    op.drop_constraint(FK_NAME, "oauthaccount", type_="foreignkey")
    op.create_foreign_key(FK_NAME, "oauthaccount", "user", ["user_id"], ["id"], ondelete="CASCADE")


def downgrade() -> None:
    op.drop_constraint(FK_NAME, "oauthaccount", type_="foreignkey")
    op.create_foreign_key(FK_NAME, "oauthaccount", "user", ["user_id"], ["id"])
