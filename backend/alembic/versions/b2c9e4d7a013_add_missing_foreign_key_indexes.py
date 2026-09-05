"""Add indexes on the remaining unindexed foreign key columns.

Postgres does not index foreign keys automatically. Every column below backs
either an eagerly loaded relationship or a delete cascade, both of which fall
back to a sequential scan without one.

Revision ID: b2c9e4d7a013
Revises: 5bfb8deb5fa6
Create Date: 2026-08-04 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "b2c9e4d7a013"
down_revision: str | None = "5bfb8deb5fa6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (index name, table, column)
FK_INDEXES: tuple[tuple[str, str, str], ...] = (
    ("ix_product_parent_id", "product", "parent_id"),
    ("ix_product_product_type_id", "product", "product_type_id"),
    ("ix_video_product_id", "video", "product_id"),
    ("ix_oauthaccount_user_id", "oauthaccount", "user_id"),
    ("ix_camera_owner_id", "camera", "owner_id"),
    ("ix_recording_session_video_id", "recording_session", "video_id"),
    ("ix_category_supercategory_id", "category", "supercategory_id"),
    ("ix_category_taxonomy_id", "category", "taxonomy_id"),
    ("ix_categorymateriallink_material_id", "categorymateriallink", "material_id"),
    ("ix_categoryproducttypelink_product_type_id", "categoryproducttypelink", "product_type_id"),
)


def upgrade() -> None:
    for name, table, column in FK_INDEXES:
        op.create_index(name, table, [column], if_not_exists=True)


def downgrade() -> None:
    for name, table, _column in FK_INDEXES:
        op.drop_index(name, table_name=table, if_exists=True)
