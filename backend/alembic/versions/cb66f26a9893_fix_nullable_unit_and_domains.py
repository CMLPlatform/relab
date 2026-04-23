"""Fix nullable drift on materialproductlink.unit and taxonomy.domains

Both columns are declared non-nullable in the ORM models but were left
nullable in the DB after the SQLModel -> SQLAlchemy 2.0 migration.

Revision ID: cb66f26a9893
Revises: c4d5e6f7a8b9
Create Date: 2026-04-09 00:20:30.902700

"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "cb66f26a9893"
down_revision: str | None = "c4d5e6f7a8b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "materialproductlink",
        "unit",
        existing_type=postgresql.ENUM("KILOGRAM", "GRAM", "METER", "CENTIMETER", name="unit"),
        nullable=False,
    )
    op.alter_column(
        "taxonomy",
        "domains",
        existing_type=postgresql.ARRAY(postgresql.ENUM("MATERIALS", "PRODUCTS", "OTHER", name="taxonomydomain")),
        nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "taxonomy",
        "domains",
        existing_type=postgresql.ARRAY(postgresql.ENUM("MATERIALS", "PRODUCTS", "OTHER", name="taxonomydomain")),
        nullable=True,
    )
    op.alter_column(
        "materialproductlink",
        "unit",
        existing_type=postgresql.ENUM("KILOGRAM", "GRAM", "METER", "CENTIMETER", name="unit"),
        nullable=True,
    )
