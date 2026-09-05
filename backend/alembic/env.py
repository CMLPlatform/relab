# noqa: D100 (the alembic folder should not be recognized as a module)
import logging

import alembic_postgresql_enum
from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlalchemy.engine.url import make_url

from app.api.common.models.base import Base
from app.core.model_registry import load_models

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
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

# Combine metadata from all imported models
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")  # noqa: ERA001
# ... etc.


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
        # NOTE: a migration that needs an ACCESS EXCLUSIVE lock (e.g. adding a CHECK
        # constraint without NOT VALID) must abort if it can't get the lock promptly,
        # rather than queueing behind readers and blocking every other query on prod.
        connection.exec_driver_sql("SET lock_timeout = '5s'")
        # lock_timeout only bounds *acquiring* a lock; this bounds how long a statement may
        # hold one. A migration with a genuinely long backfill raises its own ceiling with
        # `op.execute("SET LOCAL statement_timeout = '15min'")` rather than everyone paying it.
        connection.exec_driver_sql("SET statement_timeout = '60s'")
        # SQLAlchemy auto-begins a transaction on the first statement above; commit it so
        # alembic's own transaction below is the real (outer) one, not a savepoint nested
        # inside a never-committed transaction that gets silently rolled back on close.
        connection.commit()
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # One transaction per revision, not one around the whole `upgrade head` chain.
            # A chain-wide transaction holds every lock any revision takes until the last
            # one commits, and makes `op.get_context().autocommit_block()` (needed for
            # CREATE INDEX CONCURRENTLY) silently commit the revisions before it. The cost
            # is that a mid-chain failure leaves earlier revisions applied; re-running
            # `upgrade head` after fixing the failure resumes from there.
            transaction_per_migration=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
