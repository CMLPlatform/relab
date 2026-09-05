"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

# revision identifiers, used by Alembic.
revision: str = ${repr(up_revision)}
down_revision: str | None = ${repr(down_revision)}
branch_labels: str | Sequence[str] | None = ${repr(branch_labels)}
depends_on: str | Sequence[str] | None = ${repr(depends_on)}

# Autogenerate does not know about production traffic. Before committing, check that this
# revision does not take an ACCESS EXCLUSIVE lock while scanning a populated table:
#   - CREATE/DROP INDEX  -> postgresql_concurrently=True, alone in an autocommit_block()
#   - FOREIGN KEY, CHECK -> postgresql_not_valid=True, then VALIDATE in a later revision
#   - SET NOT NULL       -> add a validated CHECK (col IS NOT NULL) first, then drop it
#   - type changes       -> usually a full rewrite; add a new column and backfill instead
# env.py already sets lock_timeout and statement_timeout; a long backfill raises its own
# ceiling with op.execute("SET LOCAL statement_timeout = '15min'").


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
