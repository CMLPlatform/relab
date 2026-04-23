"""Add tsvector full-text search and trigram indexes to material, producttype, and category tables

Revision ID: a1b2c3d4e5f6
Revises: f3a8c2d1e5b7
Create Date: 2026-03-30 00:00:00.000000

"""

# spell-checker: ignore trgm

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "f3a8c2d1e5b7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # pg_trgm was already enabled by the product migration; guard with IF NOT EXISTS.
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # ── material ──────────────────────────────────────────────────────────────
    op.execute("""
        ALTER TABLE material
        ADD COLUMN search_vector tsvector
        GENERATED ALWAYS AS (
            to_tsvector('english',
                coalesce(name, '') || ' ' ||
                coalesce(description, '') || ' ' ||
                coalesce(source, '')
            )
        ) STORED
    """)
    op.execute("CREATE INDEX material_search_vector_idx ON material USING GIN (search_vector)")
    op.execute("CREATE INDEX material_name_trgm_idx ON material USING GIN (name gin_trgm_ops)")

    # ── producttype ───────────────────────────────────────────────────────────
    op.execute("""
        ALTER TABLE producttype
        ADD COLUMN search_vector tsvector
        GENERATED ALWAYS AS (
            to_tsvector('english',
                coalesce(name, '') || ' ' ||
                coalesce(description, '')
            )
        ) STORED
    """)
    op.execute("CREATE INDEX producttype_search_vector_idx ON producttype USING GIN (search_vector)")
    op.execute("CREATE INDEX producttype_name_trgm_idx ON producttype USING GIN (name gin_trgm_ops)")

    # ── category ──────────────────────────────────────────────────────────────
    op.execute("""
        ALTER TABLE category
        ADD COLUMN search_vector tsvector
        GENERATED ALWAYS AS (
            to_tsvector('english',
                coalesce(name, '') || ' ' ||
                coalesce(description, '')
            )
        ) STORED
    """)
    op.execute("CREATE INDEX category_search_vector_idx ON category USING GIN (search_vector)")
    op.execute("CREATE INDEX category_name_trgm_idx ON category USING GIN (name gin_trgm_ops)")


def downgrade() -> None:
    # category
    op.execute("DROP INDEX IF EXISTS category_name_trgm_idx")
    op.execute("DROP INDEX IF EXISTS category_search_vector_idx")
    op.execute("ALTER TABLE category DROP COLUMN IF EXISTS search_vector")

    # producttype
    op.execute("DROP INDEX IF EXISTS producttype_name_trgm_idx")
    op.execute("DROP INDEX IF EXISTS producttype_search_vector_idx")
    op.execute("ALTER TABLE producttype DROP COLUMN IF EXISTS search_vector")

    # material
    op.execute("DROP INDEX IF EXISTS material_name_trgm_idx")
    op.execute("DROP INDEX IF EXISTS material_search_vector_idx")
    op.execute("ALTER TABLE material DROP COLUMN IF EXISTS search_vector")
