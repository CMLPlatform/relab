"""Add full-text search (tsvector) and trigram fuzzy search indexes to product table

Revision ID: f3a8c2d1e5b7
Revises: da288fbcf15e
Create Date: 2026-03-22 00:00:00.000000

"""
# spell-checker: ignore trgm

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f3a8c2d1e5b7"
down_revision: str | None = "da288fbcf15e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Enable pg_trgm extension for trigram fuzzy matching
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # Add a stored generated tsvector column covering name, description, brand, model.
    # GENERATED ALWAYS AS STORED means Postgres maintains this automatically on insert/update.
    op.execute("""
        ALTER TABLE product
        ADD COLUMN search_vector tsvector
        GENERATED ALWAYS AS (
            to_tsvector('english',
                coalesce(name, '') || ' ' ||
                coalesce(description, '') || ' ' ||
                coalesce(brand, '') || ' ' ||
                coalesce(model, '')
            )
        ) STORED
    """)

    # GIN index for full-text search (tsvector @@ tsquery)
    op.execute("CREATE INDEX product_search_vector_idx ON product USING GIN (search_vector)")

    # GIN trigram indexes for fuzzy matching on name and brand
    # (these are the fields users are most likely to mis-spell)
    op.execute("CREATE INDEX product_name_trgm_idx ON product USING GIN (name gin_trgm_ops)")
    op.execute("CREATE INDEX product_brand_trgm_idx ON product USING GIN (brand gin_trgm_ops)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS product_brand_trgm_idx")
    op.execute("DROP INDEX IF EXISTS product_name_trgm_idx")
    op.execute("DROP INDEX IF EXISTS product_search_vector_idx")
    op.execute("ALTER TABLE product DROP COLUMN IF EXISTS search_vector")
    # Note: we intentionally leave pg_trgm installed — other tables may rely on it
