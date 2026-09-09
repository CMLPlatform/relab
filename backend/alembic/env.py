# noqa: D100 (the alembic folder should not be recognized as a module)
import logging

import alembic_postgresql_enum
from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlalchemy.engine.url import make_url

from app.api.common.models.base import Base
from app.core.model_registry import load_models

config = context.config

# Tests and scripted callers can inject a database URL; CLI migrations fall back to app settings.
database_url = config.get_alembic_option("sqlalchemy.url")
if not database_url:
    from app.core.config import settings
    from app.core.logging import setup_logging

    setup_logging()
    database_url = settings.database.sync_migration_url

config.set_main_option("sqlalchemy.url", str(database_url))

logger = logging.getLogger("alembic.env")

# Import all models so Base.metadata is complete for autogenerate
load_models()
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url", "")

    logger.info("Running migrations offline on database: %s", make_url(url).render_as_string(hide_password=True))

    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


# Arbitrary but fixed: any advisory-lock id works as long as every migrator uses the same
# one and nothing else in the codebase reuses it.
_MIGRATION_LOCK_ID = 8_247_301_559_002_113


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    url = config.get_main_option("sqlalchemy.url", "")
    engine_config = config.get_section(config.config_ini_section, {"sqlalchemy.url": url})

    connectable = engine_from_config(engine_config, prefix="sqlalchemy.", poolclass=pool.NullPool)

    logger.info("Running migrations online on database: %s", make_url(url).render_as_string(hide_password=True))

    with connectable.connect() as connection:
        # One migrator at a time. A compose restart racing a hand-run `just migrate` would
        # otherwise have both attempt the DDL, and the loser aborts partway through the
        # chain. Session-scoped, so it is released when the connection closes.
        #
        # Acquired before the timeouts below on purpose: `lock_timeout` and
        # `statement_timeout` both apply to this wait, so setting them first would make a
        # migrator that arrives behind a running one abort rather than queue, which under
        # the `migrations` profile is a failed deploy instead of a wait. The wait here is
        # deliberately unbounded; the timeouts start once this session owns the lock.
        connection.exec_driver_sql(f"SELECT pg_advisory_lock({_MIGRATION_LOCK_ID})")
        # NOTE: an ACCESS EXCLUSIVE lock that cannot be acquired promptly must abort, not
        # queue behind readers and block every other query on prod.
        connection.exec_driver_sql("SET lock_timeout = '5s'")
        # Bounds how long a statement may hold a lock. A long backfill raises its own ceiling
        # with `op.execute("SET LOCAL statement_timeout = '15min'")`.
        connection.exec_driver_sql("SET statement_timeout = '60s'")
        # Commit the auto-begun transaction so alembic's own is the outer one, not a
        # savepoint that gets rolled back on close.
        connection.commit()
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # A chain-wide transaction holds every lock until the last revision commits, and
            # autocommit_block() (CREATE INDEX CONCURRENTLY) would commit earlier revisions
            # anyway. A mid-chain failure leaves earlier revisions applied; re-run to resume.
            transaction_per_migration=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
