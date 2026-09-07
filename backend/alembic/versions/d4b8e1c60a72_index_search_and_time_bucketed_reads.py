"""Index the search, thumbnail and time-bucketed read paths.

Four groups, all of them covering a query the application already runs:

* ``image``'s parent index gains ``created_at`` so the product thumbnail
  subquery reads one index entry instead of sorting a parent's images.
* ``product.created_at`` and a partial ``image.created_at`` back the stats
  series, which buckets both tables by period over a date window.
* Trigram indexes on ``user`` and ``image`` make the admin list search
  usable; an unanchored ILIKE can use no other index type, and Postgres falls
  back to a sequential scan for the whole OR unless every branch is indexed.

NOTE: plain CREATE INDEX, so each statement holds a ShareLock that blocks
writes to its table while it builds. That is a non-issue at the current row
counts; switch to CONCURRENTLY (which needs autocommit, so one migration per
index) if these tables ever grow enough for the build to outlast a deploy.

Revision ID: d4b8e1c60a72
Revises: c3e7b1a90d24
Create Date: 2026-08-17 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "d4b8e1c60a72"
down_revision: str | None = "c3e7b1a90d24"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (index name, table, column)
TRIGRAM_INDEXES: tuple[tuple[str, str, str], ...] = (
    ("user_email_trgm_idx", '"user"', "email"),
    ("user_username_trgm_idx", '"user"', "username"),
    ("image_filename_trgm_idx", "image", "filename"),
    ("image_description_trgm_idx", "image", "description"),
    # brand and name already have one; model is the last trigram column of the
    # product suggestion endpoints left without.
    ("product_model_trgm_idx", "product", "model"),
)


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.create_index(
        "ix_image_parent_type_parent_id_created_at",
        "image",
        ["parent_type", "parent_id", "created_at"],
        if_not_exists=True,
    )
    op.drop_index("ix_image_parent_type_parent_id", table_name="image", if_exists=True)

    op.create_index("ix_product_created_at", "product", ["created_at"], if_not_exists=True)
    op.create_index(
        "ix_image_product_created_at",
        "image",
        ["created_at"],
        postgresql_where="parent_type = 'PRODUCT'",
        if_not_exists=True,
    )

    for name, table, column in TRIGRAM_INDEXES:
        op.execute(f"CREATE INDEX IF NOT EXISTS {name} ON {table} USING GIN ({column} gin_trgm_ops)")


def downgrade() -> None:
    for name, _table, _column in TRIGRAM_INDEXES:
        op.execute(f"DROP INDEX IF EXISTS {name}")

    op.drop_index("ix_image_product_created_at", table_name="image", if_exists=True)
    op.drop_index("ix_product_created_at", table_name="product", if_exists=True)

    op.create_index("ix_image_parent_type_parent_id", "image", ["parent_type", "parent_id"], if_not_exists=True)
    op.drop_index("ix_image_parent_type_parent_id_created_at", table_name="image", if_exists=True)
