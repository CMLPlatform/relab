"""Replace circularity columns with JSONB

Revision ID: c7d8e9f0a1b2
Revises: 9b7f3c1b4a2d
Create Date: 2026-04-29 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c7d8e9f0a1b2"
down_revision: str | None = "9b7f3c1b4a2d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "product",
        sa.Column("circularity_properties", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.execute("""
        UPDATE product
        SET circularity_properties = NULLIF(
            jsonb_strip_nulls(
                jsonb_build_object(
                    'recyclability', recyclability_observation,
                    'disassemblability', repairability_observation,
                    'remanufacturability', remanufacturability_observation
                )
            ),
            '{}'::jsonb
        )
    """)

    op.drop_column("product", "recyclability_observation")
    op.drop_column("product", "recyclability_comment")
    op.drop_column("product", "recyclability_reference")
    op.drop_column("product", "repairability_observation")
    op.drop_column("product", "repairability_comment")
    op.drop_column("product", "repairability_reference")
    op.drop_column("product", "remanufacturability_observation")
    op.drop_column("product", "remanufacturability_comment")
    op.drop_column("product", "remanufacturability_reference")


def downgrade() -> None:
    op.add_column("product", sa.Column("recyclability_observation", sa.VARCHAR(length=500), nullable=True))
    op.add_column("product", sa.Column("recyclability_comment", sa.VARCHAR(length=100), nullable=True))
    op.add_column("product", sa.Column("recyclability_reference", sa.VARCHAR(length=100), nullable=True))
    op.add_column("product", sa.Column("repairability_observation", sa.VARCHAR(length=500), nullable=True))
    op.add_column("product", sa.Column("repairability_comment", sa.VARCHAR(length=100), nullable=True))
    op.add_column("product", sa.Column("repairability_reference", sa.VARCHAR(length=100), nullable=True))
    op.add_column("product", sa.Column("remanufacturability_observation", sa.VARCHAR(length=500), nullable=True))
    op.add_column("product", sa.Column("remanufacturability_comment", sa.VARCHAR(length=100), nullable=True))
    op.add_column("product", sa.Column("remanufacturability_reference", sa.VARCHAR(length=100), nullable=True))

    op.execute("""
        UPDATE product
        SET recyclability_observation = circularity_properties ->> 'recyclability',
            repairability_observation = circularity_properties ->> 'disassemblability',
            remanufacturability_observation = circularity_properties ->> 'remanufacturability'
        WHERE circularity_properties IS NOT NULL
    """)

    op.drop_column("product", "circularity_properties")
