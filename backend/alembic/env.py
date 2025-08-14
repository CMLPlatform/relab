# noqa: D100, INP001 (the alembic folder should not be recognized as a module)
import sys
from logging.config import fileConfig
from pathlib import Path

import alembic_postgresql_enum  # noqa: F401 (Make sure the PostgreSQL ENUM type is recognized)
from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel  # Include the SQLModel metadata

# Load settings from the FastAPI app config
project_root = Path(__file__).resolve().parents[1]
sys.path.append(str(project_root))

from app.core.config import settings  # noqa: E402, I001 # Allow the settings to be imported after the project root is added to the path

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Set the database URL dynamically from the loaded settings
config.set_main_option("sqlalchemy.url", settings.sync_database_url)

# Import your models to include their metadata
from app.api.auth.models import OAuthAccount, Organization, User  # noqa: E402, F401
from app.api.background_data.models import (  # noqa: E402, F401
    Category,
    CategoryMaterialLink,
    CategoryProductTypeLink,
    Material,
    ProductType,
    Taxonomy,
)
from app.api.data_collection.models import (  # noqa: E402, F401
    PhysicalProperties,
    Product,
)
from app.api.file_storage.models.models import File, Image, Video  # noqa: E402, F401
from app.api.newsletter.models import NewsletterSubscriber  # noqa: E402, F401
from app.api.plugins.rpi_cam.models import Camera  # noqa: E402, F401

# Combine metadata from all imported models
target_metadata = SQLModel.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
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
    url = config.get_main_option("sqlalchemy.url")
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
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
