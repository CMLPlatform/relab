"""Root test configuration with modern 2026 best practices.

This conftest provides:
- Database setup with transaction isolation
- Async HTTP client using httpx (via plugins)
- Factory fixtures (via plugins)
- Common test utilities (via plugins)
- Mocking utilities via pytest-mock (mocker fixture auto-injected)

Key Fixtures:
- session: Isolated async database session with transaction rollback
"""

import logging
from collections.abc import AsyncGenerator, Generator
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

from alembic import command
from app.core.config import settings

# Set up logger
logger = logging.getLogger(__name__)

# Register plugins for fixture discovery
pytest_plugins = [
    "tests.fixtures.client",
    "tests.fixtures.data",
    "tests.fixtures.database",
]

# ============================================================================
# Database Setup
# ============================================================================

# Sync engine for database creation/destruction
sync_engine: Engine = create_engine(settings.sync_database_url, isolation_level="AUTOCOMMIT")

# Async engine for tests
# Async engine for tests
TEST_DATABASE_URL: str = settings.async_test_database_url
TEST_DATABASE_NAME: str = settings.postgres_test_db
# Use NullPool to ensure connections are closed after each test and not reused across loops
from sqlalchemy.pool import NullPool

async_engine: AsyncEngine = create_async_engine(TEST_DATABASE_URL, echo=False, future=True, poolclass=NullPool)

async_session_local = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


def create_test_database() -> None:
    """Create the test database. Recreate if it exists."""
    with sync_engine.connect() as connection:
        # Terminate connections to allow drop
        connection.execute(
            text(
                f"""
                SELECT pg_terminate_backend(pg_stat_activity.pid)
                FROM pg_stat_activity
                WHERE pg_stat_activity.datname = '{TEST_DATABASE_NAME}'
                AND pid <> pg_backend_pid();
                """
            )
        )
        connection.execute(text(f"DROP DATABASE IF EXISTS {TEST_DATABASE_NAME}"))
        connection.execute(text(f"CREATE DATABASE {TEST_DATABASE_NAME}"))
        logger.info("Test database created successfully.")


def get_alembic_config() -> Config:
    """Get Alembic config for running migrations in tests."""
    alembic_cfg = Config()
    project_root: Path = Path(__file__).parents[1]
    alembic_cfg.set_main_option("script_location", str(project_root / "alembic"))
    alembic_cfg.set_main_option("script_location", str(project_root / "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", settings.sync_test_database_url)
    alembic_cfg.set_main_option("is_test", "true")
    return alembic_cfg


@pytest.fixture(scope="session")
def setup_test_database() -> Generator[None]:
    """Create test database and run migrations once per test session."""
    create_test_database()

    # Run migrations to latest
    alembic_cfg: Config = get_alembic_config()
    print("Running Alembic upgrade head...")
    command.upgrade(alembic_cfg, "head")
    print("Alembic upgrade complete.")

    yield

    # Dispose async engine connections before dropping database
    import asyncio

    asyncio.run(async_engine.dispose())

    # Cleanup
    with sync_engine.connect() as connection:
        # Terminate other connections to the database to ensure DROP works
        connection.execute(
            text(
                f"""
                SELECT pg_terminate_backend(pg_stat_activity.pid)
                FROM pg_stat_activity
                WHERE pg_stat_activity.datname = '{TEST_DATABASE_NAME}'
                AND pid <> pg_backend_pid();
                """
            )
        )
        connection.execute(text(f"DROP DATABASE IF EXISTS {TEST_DATABASE_NAME}"))


@pytest.fixture
async def session(setup_test_database: None) -> AsyncGenerator[AsyncSession]:
    """Provide isolated database session using transaction rollback.

    This uses the 'connection.begin()' pattern which is more robust for async tests
    than the nested transaction approach.
    """
    async with async_engine.connect() as connection:
        # Begin a transaction that will be rolled back
        transaction = await connection.begin()

        # Bind the session to this specific connection
        session_factory = async_sessionmaker(
            bind=connection,
            class_=AsyncSession,
            autocommit=False,
            autoflush=False,
            expire_on_commit=False,
        )

        async with session_factory() as session:
            yield session

            # Rollback the transaction after the test completes
            if transaction.is_active:
                await transaction.rollback()


# ============================================================================
# Utility Fixtures
# ============================================================================


@pytest.fixture
def anyio_backend():
    """Configure anyio backend for async tests."""
    return "asyncio"
