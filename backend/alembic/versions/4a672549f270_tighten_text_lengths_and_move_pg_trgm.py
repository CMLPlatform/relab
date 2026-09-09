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
  superuser-owned ``pg_trgm``; there the ``DROP EXTENSION`` fails, the transaction
  rolls back untouched, and the error names the one superuser statement to run
  (``ALTER EXTENSION pg_trgm SET SCHEMA extensions``), after which a re-run only
  rebuilds the indexes.
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
from psycopg.errors import InsufficientPrivilege
from sqlalchemy.exc import ProgrammingError

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


SUPERUSER_INSTRUCTION = (
    "run as the postgres superuser first: ALTER EXTENSION pg_trgm SET SCHEMA extensions; then re-run"
)


def pg_trgm_schema(connection: sa.Connection) -> str:
    """Return the schema pg_trgm currently lives in."""
    return str(
        connection.execute(
            sa.text(
                "SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace "
                "WHERE e.extname = 'pg_trgm'"
            )
        ).scalar_one()
    )


def _move_pg_trgm(
    schema: str, drop: tuple[tuple[str, str, str], ...], create: tuple[tuple[str, str, str], ...]
) -> None:
    """Drop *drop*'s indexes, move pg_trgm to *schema*, then build *create*'s indexes there."""
    current_schema = pg_trgm_schema(op.get_bind())
    for index, _table, _expression in drop:
        op.execute(f"DROP INDEX {index}")
    if current_schema != schema:
        # No CASCADE: the drops above are what makes the dependency visible in review.
        #
        # Attempted rather than predicted. A `pg_has_role(current_user, extowner, 'USAGE')`
        # pre-check passes on membership, which is not what Postgres enforces here: DROP
        # EXTENSION wants the current role to *be* the owner, so a migrator that merely
        # belongs to the owning role sails past the check and fails on the DDL with a bare
        # InsufficientPrivilege. Running the statement asks the only question that matches
        # what the server checks, and the whole revision is one transaction, so a failure
        # here rolls the index drops above back with it.
        try:
            op.execute("DROP EXTENSION pg_trgm")
        except ProgrammingError as exc:
            if not isinstance(exc.orig, InsufficientPrivilege):
                raise
            # On hosts provisioned before the migrator role existed, pg_trgm belongs to
            # the superuser and only the superuser can move it.
            msg = f"pg_trgm is in schema {current_schema!r} and the migrator does not own it; {SUPERUSER_INSTRUCTION}"
            raise RuntimeError(msg) from exc
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
    # Back to the length the initial revision declares, not an unbounded VARCHAR: a
    # downgrade has to land on the schema a fresh build produces, or the next upgrade's
    # narrowing fails on whatever was written while rolled back. Fails loudly if a title
    # longer than 100 exists. That is legal at head, so truncate or restore the backup.
    op.execute("ALTER TABLE video ALTER COLUMN title TYPE VARCHAR(100)")
    _move_pg_trgm("public", SEARCH_TRIGRAM_INDEXES, SEARCH_TRIGRAM_INDEXES + ADMIN_LIST_TRIGRAM_INDEXES)
    op.execute('ALTER TABLE "user" RENAME CONSTRAINT user_profile_stats_not_null TO user_stats_cache_not_null')
