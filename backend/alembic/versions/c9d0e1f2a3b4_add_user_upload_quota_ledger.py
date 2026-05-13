"""Add user upload quota ledger counters.

Revision ID: c9d0e1f2a3b4
Revises: 591bfc225c05
Create Date: 2026-05-13 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c9d0e1f2a3b4"
down_revision: str | None = "591bfc225c05"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add and backfill authoritative per-user upload quota counters."""
    op.add_column("user", sa.Column("upload_file_count", sa.Integer(), server_default="0", nullable=False))
    op.add_column("user", sa.Column("upload_total_bytes", sa.BigInteger(), server_default="0", nullable=False))
    op.create_check_constraint(
        "ck_user_upload_file_count_non_negative",
        "user",
        "upload_file_count >= 0",
    )
    op.create_check_constraint(
        "ck_user_upload_total_bytes_non_negative",
        "user",
        "upload_total_bytes >= 0",
    )
    op.create_check_constraint(
        "ck_file_upload_size_bytes_non_negative",
        "file",
        "upload_size_bytes >= 0",
    )
    op.create_check_constraint(
        "ck_image_upload_size_bytes_non_negative",
        "image",
        "upload_size_bytes >= 0",
    )
    op.execute(
        sa.text(
            """
            WITH upload_totals AS (
                SELECT
                    owner_id,
                    count(*) AS file_count,
                    coalesce(sum(upload_size_bytes), 0) AS total_bytes
                FROM (
                    SELECT product.owner_id, file.upload_size_bytes
                    FROM file
                    JOIN product
                        ON file.parent_type = 'PRODUCT'
                        AND file.parent_id = product.id
                    UNION ALL
                    SELECT product.owner_id, image.upload_size_bytes
                    FROM image
                    JOIN product
                        ON image.parent_type = 'PRODUCT'
                        AND image.parent_id = product.id
                ) AS product_media
                GROUP BY owner_id
            )
            UPDATE "user"
            SET
                upload_file_count = upload_totals.file_count,
                upload_total_bytes = upload_totals.total_bytes
            FROM upload_totals
            WHERE "user".id = upload_totals.owner_id
            """
        )
    )


def downgrade() -> None:
    """Remove per-user upload quota counters."""
    op.drop_constraint("ck_image_upload_size_bytes_non_negative", "image", type_="check")
    op.drop_constraint("ck_file_upload_size_bytes_non_negative", "file", type_="check")
    op.drop_constraint("ck_user_upload_total_bytes_non_negative", "user", type_="check")
    op.drop_constraint("ck_user_upload_file_count_non_negative", "user", type_="check")
    op.drop_column("user", "upload_total_bytes")
    op.drop_column("user", "upload_file_count")
