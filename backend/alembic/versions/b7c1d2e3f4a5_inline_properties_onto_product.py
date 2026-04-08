"""Inline physical and circularity properties onto product table

Revision ID: b7c1d2e3f4a5
Revises: e3d54054d34a
Create Date: 2026-04-08 12:00:00.000000

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b7c1d2e3f4a5"
down_revision: str | None = "e3d54054d34a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add physical property columns to the product table
    op.add_column("product", sa.Column("weight_g", sa.Float(), nullable=True))
    op.add_column("product", sa.Column("height_cm", sa.Float(), nullable=True))
    op.add_column("product", sa.Column("width_cm", sa.Float(), nullable=True))
    op.add_column("product", sa.Column("depth_cm", sa.Float(), nullable=True))

    # 2. Add circularity property columns to the product table
    op.add_column("product", sa.Column("recyclability_observation", sa.String(length=500), nullable=True))
    op.add_column("product", sa.Column("recyclability_comment", sa.String(length=100), nullable=True))
    op.add_column("product", sa.Column("recyclability_reference", sa.String(length=100), nullable=True))
    op.add_column("product", sa.Column("repairability_observation", sa.String(length=500), nullable=True))
    op.add_column("product", sa.Column("repairability_comment", sa.String(length=100), nullable=True))
    op.add_column("product", sa.Column("repairability_reference", sa.String(length=100), nullable=True))
    op.add_column("product", sa.Column("remanufacturability_observation", sa.String(length=500), nullable=True))
    op.add_column("product", sa.Column("remanufacturability_comment", sa.String(length=100), nullable=True))
    op.add_column("product", sa.Column("remanufacturability_reference", sa.String(length=100), nullable=True))

    # 3. Copy data from physicalproperties to product
    op.execute("""
        UPDATE product
        SET weight_g = pp.weight_g,
            height_cm = pp.height_cm,
            width_cm = pp.width_cm,
            depth_cm = pp.depth_cm
        FROM physicalproperties pp
        WHERE pp.product_id = product.id
    """)

    # 4. Copy data from circularityproperties to product
    op.execute("""
        UPDATE product
        SET recyclability_observation = cp.recyclability_observation,
            recyclability_comment = cp.recyclability_comment,
            recyclability_reference = cp.recyclability_reference,
            repairability_observation = cp.repairability_observation,
            repairability_comment = cp.repairability_comment,
            repairability_reference = cp.repairability_reference,
            remanufacturability_observation = cp.remanufacturability_observation,
            remanufacturability_comment = cp.remanufacturability_comment,
            remanufacturability_reference = cp.remanufacturability_reference
        FROM circularityproperties cp
        WHERE cp.product_id = product.id
    """)

    # 5. Drop old tables
    op.drop_table("physicalproperties")
    op.drop_table("circularityproperties")


def downgrade() -> None:
    # Re-create the property tables
    op.create_table(
        "physicalproperties",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("weight_g", sa.Float(), nullable=True),
        sa.Column("height_cm", sa.Float(), nullable=True),
        sa.Column("width_cm", sa.Float(), nullable=True),
        sa.Column("depth_cm", sa.Float(), nullable=True),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["product_id"], ["product.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "circularityproperties",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("recyclability_observation", sa.String(length=500), nullable=True),
        sa.Column("recyclability_comment", sa.String(length=100), nullable=True),
        sa.Column("recyclability_reference", sa.String(length=100), nullable=True),
        sa.Column("repairability_observation", sa.String(length=500), nullable=True),
        sa.Column("repairability_comment", sa.String(length=100), nullable=True),
        sa.Column("repairability_reference", sa.String(length=100), nullable=True),
        sa.Column("remanufacturability_observation", sa.String(length=500), nullable=True),
        sa.Column("remanufacturability_comment", sa.String(length=100), nullable=True),
        sa.Column("remanufacturability_reference", sa.String(length=100), nullable=True),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["product_id"], ["product.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # Copy data back
    op.execute("""
        INSERT INTO physicalproperties (weight_g, height_cm, width_cm, depth_cm, product_id)
        SELECT weight_g, height_cm, width_cm, depth_cm, id
        FROM product
        WHERE weight_g IS NOT NULL OR height_cm IS NOT NULL
              OR width_cm IS NOT NULL OR depth_cm IS NOT NULL
    """)

    op.execute("""
        INSERT INTO circularityproperties (
            recyclability_observation, recyclability_comment, recyclability_reference,
            repairability_observation, repairability_comment, repairability_reference,
            remanufacturability_observation, remanufacturability_comment, remanufacturability_reference,
            product_id
        )
        SELECT
            recyclability_observation, recyclability_comment, recyclability_reference,
            repairability_observation, repairability_comment, repairability_reference,
            remanufacturability_observation, remanufacturability_comment, remanufacturability_reference,
            id
        FROM product
        WHERE recyclability_observation IS NOT NULL OR recyclability_comment IS NOT NULL
              OR repairability_observation IS NOT NULL OR remanufacturability_observation IS NOT NULL
    """)

    # Drop inlined columns
    op.drop_column("product", "weight_g")
    op.drop_column("product", "height_cm")
    op.drop_column("product", "width_cm")
    op.drop_column("product", "depth_cm")
    op.drop_column("product", "recyclability_observation")
    op.drop_column("product", "recyclability_comment")
    op.drop_column("product", "recyclability_reference")
    op.drop_column("product", "repairability_observation")
    op.drop_column("product", "repairability_comment")
    op.drop_column("product", "repairability_reference")
    op.drop_column("product", "remanufacturability_observation")
    op.drop_column("product", "remanufacturability_comment")
    op.drop_column("product", "remanufacturability_reference")
