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

import asyncio
import logging
import os
from pathlib import Path
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

import pytest
from alembic.config import Config
from loguru import logger as loguru_logger
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel.ext.asyncio.session import AsyncSession

from alembic import command
from app.core.config import settings

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator, Generator

    from pytest_mock import MockerFixture

# Set up logger
logger = logging.getLogger(__name__)

# Register plugins for fixture discovery
pytest_plugins = ["tests.fixtures.client", "tests.fixtures.data", "tests.fixtures.database", "tests.fixtures.redis"]

# ============================================================================
# Database Setup
# ============================================================================

# Sync engine for database creation/destruction
sync_engine: Engine = create_engine(settings.sync_database_url, isolation_level="AUTOCOMMIT")

logger.info("Creating async engine for database setup with URL: %s ...", settings.sync_database_url)

# Async engine for tests
worker_id = os.environ.get("PYTEST_XDIST_WORKER")

TEST_DATABASE_NAME: str = settings.postgres_test_db
MASTER_WORKER = "master"
if worker_id is not None and worker_id != MASTER_WORKER:
    TEST_DATABASE_NAME = f"{TEST_DATABASE_NAME}_{worker_id}"

TEST_DATABASE_URL: str = settings.build_database_url("asyncpg", TEST_DATABASE_NAME)
SYNC_TEST_DATABASE_URL: str = settings.build_database_url("psycopg", TEST_DATABASE_NAME)
# Use NullPool to ensure connections are closed after each test and not reused across loops
logger.info("Creating async engine for test database with URL: %s ...", TEST_DATABASE_URL)

async_engine: AsyncEngine = create_async_engine(TEST_DATABASE_URL, echo=False, future=True, poolclass=NullPool)


async_session_local = async_sessionmaker(
    bind=async_engine, class_=AsyncSession, autocommit=False, autoflush=False, expire_on_commit=False
)


def create_test_database() -> None:
    """Create the test database. Recreate if it exists."""
    with sync_engine.connect() as connection:
        # Terminate connections to allow drop
        term_query = text("""
            SELECT pg_terminate_backend(pg_stat_activity.pid)
            FROM pg_stat_activity
            WHERE pg_stat_activity.datname = :db_name
            AND pid <> pg_backend_pid();
        """)
        connection.execute(term_query, {"db_name": TEST_DATABASE_NAME})

        # DDL statements don't support bind parameters, but TEST_DATABASE_NAME is safe (controlled by settings)
        drop_query = f"DROP DATABASE IF EXISTS {TEST_DATABASE_NAME}"
        connection.execute(text(drop_query))

        create_query = f"CREATE DATABASE {TEST_DATABASE_NAME}"
        connection.execute(text(create_query))
        logger.info("Test database created successfully.")


def get_alembic_config() -> Config:
    """Get Alembic config for running migrations to set up the test database schema."""
    project_root: Path = Path(__file__).parents[1]
    alembic_cfg = Config(toml_file=str(project_root / "pyproject.toml"))

    # Set test-specific options
    alembic_cfg.set_main_option("script_location", str(project_root / "alembic"))
    alembic_cfg.set_main_option("is_test", "true")
    alembic_cfg.set_main_option("sqlalchemy.url", SYNC_TEST_DATABASE_URL)

    return alembic_cfg


@pytest.fixture(scope="session")
def _setup_test_database() -> Generator[None]:
    """Create test database and run migrations once per test session."""
    create_test_database()

    # Run migrations to latest
    alembic_cfg: Config = get_alembic_config()
    logger.info("Running Alembic upgrade head...")
    command.upgrade(alembic_cfg, "head")
    logger.info("Alembic upgrade complete.")

    yield

    # Dispose async engine connections before dropping database
    asyncio.run(async_engine.dispose())

    # Cleanup
    with sync_engine.connect() as connection:
        # Terminate other connections to the database to ensure DROP works
        term_query = text("""
            SELECT pg_terminate_backend(pg_stat_activity.pid)
            FROM pg_stat_activity
            WHERE pg_stat_activity.datname = :db_name
            AND pid <> pg_backend_pid();
        """)
        connection.execute(term_query, {"db_name": TEST_DATABASE_NAME})

        # DDL statements don't support bind parameters, but TEST_DATABASE_NAME is safe (controlled by settings)
        drop_query = f"DROP DATABASE IF EXISTS {TEST_DATABASE_NAME}"
        connection.execute(text(drop_query))


@pytest.fixture
async def session(_setup_test_database: None) -> AsyncGenerator[AsyncSession]:
    """Provide isolated database session using transaction rollback.

    This uses the 'connection.begin()' pattern which is more robust for async tests
    than the nested transaction approach.
    """
    async with async_engine.connect() as connection:
        # Begin a transaction that will be rolled back
        transaction = await connection.begin()

        # Bind the session to this specific connection
        session_factory = async_sessionmaker(
            bind=connection, class_=AsyncSession, autocommit=False, autoflush=False, expire_on_commit=False
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
def anyio_backend() -> str:
    """Configure anyio backend for async tests."""
    return "asyncio"


# ============================================================================
# Email Mocking
# ============================================================================


@pytest.fixture(autouse=True, scope="session")
def cleanup_loguru() -> Generator[None]:
    """Ensure Loguru background queues are closed cleanly after testing session."""
    yield
    loguru_logger.remove()


@pytest.fixture(autouse=True)
def mock_email_sending(mocker: MockerFixture) -> AsyncMock:
    """Automatically mock email sending for all tests.

    This prevents any actual emails from being sent during testing by mocking
    the FastMail instance's send_message method.
    """
    return mocker.patch(
        "app.api.auth.utils.programmatic_emails.fm.send_message",
        new_callable=AsyncMock,
    )
