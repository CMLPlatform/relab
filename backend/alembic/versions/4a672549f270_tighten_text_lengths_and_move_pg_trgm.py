"""Tighten text lengths and move pg_trgm to the extensions schema.

* ``user_stats_cache_not_null`` is the name a column rename left behind; the flat
  initial revision reproduces it so the schema still matches prod, and this one
  retires it for ``user_profile_stats_not_null``.
* ``pg_trgm`` joins ``unaccent`` in ``extensions``, the schema ``just restore``
  leaves alone when it drops and recreates ``public``. Existing indexes keep
  working (an opclass is referenced by OID), but every ``%`` operator and
  ``gin_trgm_ops`` reference in the app is schema-qualified, because the test
  database does not get the ``public, extensions, pg_catalog`` search_path that
  provision.sh sets on the deployed roles.
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
ROLLBACK_SAFE = True  # the gate would pass anyway; here as documentation that downgrade loses nothing


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '3s'")
    op.execute('ALTER TABLE "user" RENAME CONSTRAINT user_stats_cache_not_null TO user_profile_stats_not_null')
    op.execute("ALTER EXTENSION pg_trgm SET SCHEMA extensions")
    op.execute("ALTER TABLE video ALTER COLUMN title TYPE VARCHAR(200)")
    op.execute('ALTER TABLE "user" ALTER COLUMN username TYPE VARCHAR(50)')


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '3s'")
    op.execute('ALTER TABLE "user" ALTER COLUMN username TYPE VARCHAR')
    op.execute("ALTER TABLE video ALTER COLUMN title TYPE VARCHAR")
    op.execute("ALTER EXTENSION pg_trgm SET SCHEMA public")
    op.execute('ALTER TABLE "user" RENAME CONSTRAINT user_profile_stats_not_null TO user_stats_cache_not_null')
