"""Tighten text lengths and move pg_trgm to the extensions schema.

* ``user_stats_cache_not_null`` is the name a column rename left behind; the flat
  initial revision reproduces it so the schema still matches prod, and this one
  retires it for ``user_profile_stats_not_null``.
* ``pg_trgm`` joins ``unaccent`` in ``extensions``, the schema ``just restore``
  leaves alone when it drops and recreates ``public``. Not with ``ALTER EXTENSION
  ... SET SCHEMA``: a trusted extension's member objects belong to the bootstrap
  superuser, so that is superuser-only and the migrator role cannot run it. The
  extension is dropped and recreated instead, which the migrator may do because it
  owns both the extension and the trigram indexes. Those eleven indexes are dropped
  first and rebuilt against ``extensions.gin_trgm_ops`` afterwards; a plain
  ``CREATE INDEX`` takes a write lock on each table, which is fine at the current
  sizes. Every ``%`` operator and ``gin_trgm_ops`` reference in the app is
  schema-qualified too, because the test database does not get the
  ``public, extensions, pg_catalog`` search_path provision.sh sets on deployed roles.
* ``video.title`` widens 100 -> 200 and ``user.username`` gains the 50-character
  bound the API has enforced through ``UsernameValue`` for a long time. Widening
  a varchar is metadata-only; the username narrowing scans ``user`` under ACCESS
  EXCLUSIVE, which is fine at the current table size, and ``lock_timeout`` keeps
  it from queueing behind a long reader. ``downgrade()`` widens both columns back
  to an unbounded ``VARCHAR`` rather than restoring the old caps, because a
  narrowing downgrade would fail on any row written since the upgrade.

Revision ID: 4a672549f270
Revises: a9c2e4f60b18
Create Date: 2026-09-08 23:17:42.990357

"""

from collections.abc import Sequence

from alembic import op

revision: str = "4a672549f270"
down_revision: str | None = "a9c2e4f60b18"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
ROLLBACK_SAFE = True  # upgrade() drops indexes and the extension, and recreates every one of them

# (index, table, indexed expression) for every trigram index, in the shape the flat
# initial revision creates them. The opclass schema is the only thing that changes.
TRIGRAM_INDEXES = (
    ("category_name_trgm_idx", "category", "relab_unaccent(name)"),
    ("material_name_trgm_idx", "material", "relab_unaccent(name)"),
    ("producttype_name_trgm_idx", "producttype", "relab_unaccent(name)"),
    ("producttype_description_trgm_idx", "producttype", "relab_unaccent(description)"),
    ("product_name_trgm_idx", "product", "relab_unaccent(name)"),
    ("product_brand_trgm_idx", "product", "relab_unaccent(brand)"),
    ("product_model_trgm_idx", "product", "relab_unaccent(model)"),
    ("user_email_trgm_idx", '"user"', "email"),
    ("user_username_trgm_idx", '"user"', "username"),
    ("image_filename_trgm_idx", "image", "filename"),
    ("image_description_trgm_idx", "image", "description"),
)


def _move_pg_trgm(schema: str) -> None:
    """Drop the trigram indexes, move pg_trgm to *schema*, then rebuild them there."""
    for index, _table, _expression in TRIGRAM_INDEXES:
        op.execute(f"DROP INDEX {index}")
    # No CASCADE: the drops above are what makes the dependency visible in review.
    op.execute("DROP EXTENSION pg_trgm")
    op.execute(f"CREATE EXTENSION pg_trgm SCHEMA {schema}")
    for index, table, expression in TRIGRAM_INDEXES:
        op.execute(f"CREATE INDEX {index} ON {table} USING gin ({expression} {schema}.gin_trgm_ops)")


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '3s'")
    op.execute('ALTER TABLE "user" RENAME CONSTRAINT user_stats_cache_not_null TO user_profile_stats_not_null')
    _move_pg_trgm("extensions")
    op.execute("ALTER TABLE video ALTER COLUMN title TYPE VARCHAR(200)")
    op.execute('ALTER TABLE "user" ALTER COLUMN username TYPE VARCHAR(50)')


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '3s'")
    op.execute('ALTER TABLE "user" ALTER COLUMN username TYPE VARCHAR')
    op.execute("ALTER TABLE video ALTER COLUMN title TYPE VARCHAR")
    _move_pg_trgm("public")
    op.execute('ALTER TABLE "user" RENAME CONSTRAINT user_profile_stats_not_null TO user_stats_cache_not_null')
