# noqa: D100 (the alembic folder should not be recognized as a module)
import contextlib
import logging
import sys
from pathlib import Path

with contextlib.suppress(ModuleNotFoundError):
    import alembic_postgresql_enum  # Registers Alembic plugin for enum migrations; installed via `migrations` extra

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlalchemy.engine.url import make_url

from app.api.common.models.base import Base
from app.core.config import settings
from app.core.logging import setup_logging
from app.core.model_registry import load_models

# Load settings from the FastAPI app config
project_root = Path(__file__).resolve().parents[1]
sys.path.append(str(project_root))

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Set the synchronous database URL if not already set in the test environment
if config.get_alembic_option("is_test") != "true":  # noqa: PLR2004 # This variable is set in tests/conftest.py to indicate a test environment
    setup_logging()
    config.set_main_option("sqlalchemy.url", settings.sync_database_url)
else:
    # In tests, logging is already configured in conftest.py.
    # We just need to ensure the alembic.env logger exists.
    pass

logger = logging.getLogger("alembic.env")

# Import all models so Base.metadata is complete for autogenerate
load_models()

# Combine metadata from all imported models
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option") # noqa: ERA001
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
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
