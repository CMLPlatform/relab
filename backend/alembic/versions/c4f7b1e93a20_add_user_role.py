"""add user role

Revision ID: c4f7b1e93a20
Revises: b7e2d9a4c1f0
Create Date: 2026-08-18 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4f7b1e93a20"
down_revision: str | None = "b7e2d9a4c1f0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CONSTRAINT_NAME = "ck_user_role_valid"


def upgrade() -> None:
    # NOT NULL with a server_default is metadata-only from Postgres 11 on: no table
    # rewrite, so the ACCESS EXCLUSIVE lock is held only for the catalogue update.
    # Every existing row lands on 'contributor' — deliberately fail-closed. Lab
    # accounts are promoted afterwards through the admin role route.
    op.add_column(
        "user",
        sa.Column("role", sa.String(length=20), nullable=False, server_default="contributor"),
    )
    # Added NOT VALID so the constraint applies to new writes immediately without
    # scanning the table under the lock; VALIDATE then takes only a SHARE UPDATE
    # EXCLUSIVE lock, which does not block reads or writes.
    op.create_check_constraint(
        CONSTRAINT_NAME,
        "user",
        "role IN ('contributor', 'lab')",
        postgresql_not_valid=True,
    )
    op.execute(f'ALTER TABLE "user" VALIDATE CONSTRAINT {CONSTRAINT_NAME}')


def downgrade() -> None:
    op.drop_constraint(CONSTRAINT_NAME, "user", type_="check")
    op.drop_column("user", "role")
