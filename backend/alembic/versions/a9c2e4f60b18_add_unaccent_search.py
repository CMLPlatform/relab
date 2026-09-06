"""Make full-text and trigram search accent-insensitive.

CPV labels are published in every EU language and contributors type product
names as they read them, so ``café`` has to find ``Cafe`` and the reverse. Both
search paths currently treat a diacritic as a distinct character.

* ``unaccent`` is installed in the ``extensions`` schema, which ``just restore``
  leaves alone when it drops and recreates ``public``. It is a trusted
  extension, so the migrator can create it with the ``CREATE`` grant that
  ``deploy/postgres/initdb/provision.sh`` gives it on that schema.
* ``relab_unaccent(text)`` is an IMMUTABLE wrapper (``unaccent`` itself is only
  STABLE, so it cannot appear in an index or generated column). The dictionary
  is fixed, which is what makes the promise honest.
* The ``relab`` text search configuration is ``english`` with ``unaccent`` in
  front of the stemmer; the four generated ``search_vector`` columns switch to
  it. A generated column's expression cannot be altered in place, so each is
  dropped and re-added, which rewrites the table.
* The seven trigram indexes behind ``%`` become expression indexes on
  ``relab_unaccent(column)``; ``search_utils`` wraps both operands the same way.
  The ``user`` and ``image`` trigram indexes stay on the bare column: they back
  ``ILIKE`` in the admin lists, which is untouched.

NOTE: plain CREATE INDEX and full table rewrites, so every table here is
write-locked for the duration, the same trade-off as d4b8e1c60a72. Fine at the
current row counts; split into CONCURRENTLY builds before a table reaches the
size where the rewrite outlasts a deploy window.

Revision ID: a9c2e4f60b18
Revises: c4f7b1e93a20
Create Date: 2026-09-06 18:00:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "a9c2e4f60b18"
down_revision: str | None = "c4f7b1e93a20"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PRODUCT_SEARCH_BODY = (
    "coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(model, '')"
)

# (table, tsvector expression body); mirrors the Computed() strings on the models.
SEARCH_VECTORS: tuple[tuple[str, str], ...] = (
    ("category", "coalesce(name, '') || ' ' || coalesce(description, '')"),
    ("material", "coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(source, '')"),
    ("producttype", "coalesce(name, '') || ' ' || coalesce(description, '')"),
    ("product", _PRODUCT_SEARCH_BODY),
)

# (index name, table, column) behind every ``%`` in ``build_text_search_clause``.
TRIGRAM_INDEXES: tuple[tuple[str, str, str], ...] = (
    ("category_name_trgm_idx", "category", "name"),
    ("material_name_trgm_idx", "material", "name"),
    ("producttype_name_trgm_idx", "producttype", "name"),
    ("producttype_description_trgm_idx", "producttype", "description"),
    ("product_name_trgm_idx", "product", "name"),
    ("product_brand_trgm_idx", "product", "brand"),
    ("product_model_trgm_idx", "product", "model"),
)


def _rebuild_search_vectors(config: str) -> None:
    for table, body in SEARCH_VECTORS:
        op.execute(f"ALTER TABLE {table} DROP COLUMN search_vector")
        op.execute(
            f"ALTER TABLE {table} ADD COLUMN search_vector tsvector "
            f"GENERATED ALWAYS AS (to_tsvector('{config}', {body})) STORED"
        )
        op.execute(f"CREATE INDEX {table}_search_vector_idx ON {table} USING GIN (search_vector)")


def _rebuild_trigram_indexes(*, unaccented: bool) -> None:
    for name, table, column in TRIGRAM_INDEXES:
        expr = f"relab_unaccent({column})" if unaccented else column
        op.execute(f"DROP INDEX IF EXISTS {name}")
        op.execute(f"CREATE INDEX {name} ON {table} USING GIN ({expr} gin_trgm_ops)")


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '3s'")
    op.execute("CREATE SCHEMA IF NOT EXISTS extensions")
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA extensions")
    # String body on purpose: pg_dump restores functions with check_function_bodies
    # off, so a restore does not need the extension before pre-data.
    op.execute(
        "CREATE OR REPLACE FUNCTION public.relab_unaccent(text) RETURNS text "
        "LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT "
        "AS $$ SELECT extensions.unaccent('extensions.unaccent', $1) $$"
    )
    op.execute(
        "DO $$ BEGIN "
        "IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'relab') THEN "
        "CREATE TEXT SEARCH CONFIGURATION public.relab (COPY = pg_catalog.english); "
        "END IF; END $$"
    )
    op.execute(
        "ALTER TEXT SEARCH CONFIGURATION public.relab "
        "ALTER MAPPING FOR hword, hword_part, word WITH extensions.unaccent, english_stem"
    )
    _rebuild_search_vectors("public.relab")
    _rebuild_trigram_indexes(unaccented=True)


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '3s'")
    _rebuild_trigram_indexes(unaccented=False)
    _rebuild_search_vectors("english")
    op.execute("DROP TEXT SEARCH CONFIGURATION IF EXISTS public.relab")
    op.execute("DROP FUNCTION IF EXISTS public.relab_unaccent(text)")
    op.execute("DROP EXTENSION IF EXISTS unaccent")
