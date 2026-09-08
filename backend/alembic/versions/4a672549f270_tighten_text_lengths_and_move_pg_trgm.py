"""Tighten text lengths and move pg_trgm to the extensions schema.

* ``user_stats_cache_not_null`` is the name a column rename left behind; the flat
  initial revision reproduces it so the schema still matches prod, and this one
  retires it for ``user_profile_stats_not_null``.
* ``pg_trgm`` joins ``unaccent`` in ``extensions``, the schema ``just restore``
  leaves alone when it drops and recreates ``public``. Not with ``ALTER EXTENSION
  ... SET SCHEMA``: a trusted extension's member objects belong to the bootstrap
  superuser, so that is superuser-only and the migrator role cannot run it. The
  extension is dropped and recreated instead, which the migrator may do because it
  owns both the extension and the trigram indexes. All eleven are dropped first and
  the seven search ones rebuilt against ``extensions.gin_trgm_ops`` afterwards; a
  plain ``CREATE INDEX`` takes a write lock on each table, which is fine at the
  current sizes. Hosts provisioned before the migrator role existed have a
  superuser-owned ``pg_trgm``; there the revision stops before touching anything
  and names the one superuser statement to run (``ALTER EXTENSION pg_trgm SET
  SCHEMA extensions``), after which a re-run only rebuilds the indexes.
* The four admin-list trigram indexes are not rebuilt. On prod ``image`` holds 4452
  rows against 18.6k writes and both of its trigram indexes (``image_filename_trgm_idx``
  alone is 1.1 MB) have never been scanned; ``user`` holds 34 rows. An unanchored ILIKE
  over tables that size seq-scans in well under a millisecond, while the GIN indexes
  cost on every write. ``downgrade()`` recreates all eleven, so prod's pre-upgrade
  schema is still reachable. Every ``%`` operator and ``gin_trgm_ops`` reference in the app is
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

import sqlalchemy as sa
from alembic import op

revision: str = "4a672549f270"
down_revision: str | None = "a9c2e4f60b18"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
ROLLBACK_SAFE = True  # upgrade() drops indexes and the extension, and recreates every one of them

# (index, table, indexed expression), in the shape the flat initial revision creates
# them. The seven search indexes are rebuilt in the new schema; the four admin-list ones
# are dropped for good.
SEARCH_TRIGRAM_INDEXES = (
    ("category_name_trgm_idx", "category", "relab_unaccent(name)"),
    ("material_name_trgm_idx", "material", "relab_unaccent(name)"),
    ("producttype_name_trgm_idx", "producttype", "relab_unaccent(name)"),
    ("producttype_description_trgm_idx", "producttype", "relab_unaccent(description)"),
    ("product_name_trgm_idx", "product", "relab_unaccent(name)"),
    ("product_brand_trgm_idx", "product", "relab_unaccent(brand)"),
    ("product_model_trgm_idx", "product", "relab_unaccent(model)"),
)
ADMIN_LIST_TRIGRAM_INDEXES = (
    ("user_email_trgm_idx", '"user"', "email"),
    ("user_username_trgm_idx", '"user"', "username"),
    ("image_filename_trgm_idx", "image", "filename"),
    ("image_description_trgm_idx", "image", "description"),
)


def pg_trgm_state(connection: sa.Connection) -> tuple[str, bool]:
    """Return (schema pg_trgm lives in, whether the current role owns it)."""
    row = connection.execute(
        sa.text(
            "SELECT n.nspname, pg_has_role(current_user, e.extowner, 'USAGE') "
            "FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace "
            "WHERE e.extname = 'pg_trgm'"
        )
    ).one()
    return str(row[0]), bool(row[1])


def _move_pg_trgm(
    schema: str, drop: tuple[tuple[str, str, str], ...], create: tuple[tuple[str, str, str], ...]
) -> None:
    """Drop *drop*'s indexes, move pg_trgm to *schema*, then build *create*'s indexes there."""
    current_schema, owned = pg_trgm_state(op.get_bind())
    if current_schema != schema and not owned:
        # On hosts provisioned before the migrator role existed, pg_trgm belongs to the
        # superuser and only the superuser can move it. Fail before touching anything.
        msg = (
            f"pg_trgm is in schema {current_schema!r} and not owned by the migrator; run as the "
            f"postgres superuser first: ALTER EXTENSION pg_trgm SET SCHEMA {schema}; then re-run"
        )
        raise RuntimeError(msg)
    for index, _table, _expression in drop:
        op.execute(f"DROP INDEX {index}")
    if current_schema != schema:
        # No CASCADE: the drops above are what makes the dependency visible in review.
        op.execute("DROP EXTENSION pg_trgm")
        op.execute(f"CREATE EXTENSION pg_trgm SCHEMA {schema}")
    for index, table, expression in create:
        op.execute(f"CREATE INDEX {index} ON {table} USING gin ({expression} {schema}.gin_trgm_ops)")


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '3s'")
    op.execute('ALTER TABLE "user" RENAME CONSTRAINT user_stats_cache_not_null TO user_profile_stats_not_null')
    _move_pg_trgm("extensions", SEARCH_TRIGRAM_INDEXES + ADMIN_LIST_TRIGRAM_INDEXES, SEARCH_TRIGRAM_INDEXES)
    op.execute("ALTER TABLE video ALTER COLUMN title TYPE VARCHAR(200)")
    op.execute('ALTER TABLE "user" ALTER COLUMN username TYPE VARCHAR(50)')


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '3s'")
    op.execute('ALTER TABLE "user" ALTER COLUMN username TYPE VARCHAR')
    op.execute("ALTER TABLE video ALTER COLUMN title TYPE VARCHAR")
    _move_pg_trgm("public", SEARCH_TRIGRAM_INDEXES, SEARCH_TRIGRAM_INDEXES + ADMIN_LIST_TRIGRAM_INDEXES)
    op.execute('ALTER TABLE "user" RENAME CONSTRAINT user_profile_stats_not_null TO user_stats_cache_not_null')
