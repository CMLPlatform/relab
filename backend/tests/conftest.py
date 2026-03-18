"""Root test configuration with containerized Postgres test database setup.

This conftest provides:
- Ephemeral Postgres via Testcontainers (session-scoped)
- Database setup with transaction isolation
- Async HTTP client using httpx (via plugins)
- Factory fixtures (via plugins)
- Common test utilities (via plugins)
- Mocking utilities via pytest-mock (mocker fixture auto-injected)

Key Fixtures:
- session: Isolated async database session with transaction rollback

Architecture:
- Testcontainers starts before pytest collection via pytest_configure hook
- Container coordinates are written to environment variables
- Application settings load from these env vars at import time
- This ensures consistent URL usage across fixtures and application code
"""

import asyncio
import logging
import os
import re
from pathlib import Path
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

import pytest
from alembic.config import Config
from loguru import logger as loguru_logger
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel.ext.asyncio.session import AsyncSession
from testcontainers.postgres import PostgresContainer

from alembic import command

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator, Generator

    from pytest_mock import MockerFixture

logger = logging.getLogger(__name__)

pytest_plugins = ["tests.fixtures.client", "tests.fixtures.data", "tests.fixtures.database", "tests.fixtures.redis"]

_DEFAULT_TEST_DB_NAME = "test_relab"
_MASTER_WORKER = "master"
_SAFE_DB_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

# Global container instance for entire test session
_GLOBAL_POSTGRES_CONTAINER: PostgresContainer | None = None


def pytest_configure(config: pytest.Config) -> None:
    """Start Testcontainers and configure environment before test collection.

    This hook runs before pytest imports test modules, ensuring that when
    app.core.config.settings loads, it uses the container coordinates.
    """
    if os.environ.get("IN_DOCKER") == "true":
        logger.info("Running inside Docker, skipping Testcontainers...")
        return

    global _GLOBAL_POSTGRES_CONTAINER  # noqa: PLW0603

    # Start Postgres container
    logger.info("Starting Testcontainers Postgres...")
    _GLOBAL_POSTGRES_CONTAINER = PostgresContainer(
        "postgres:17-alpine",
        username="postgres",
        password="postgres",
        dbname="postgres",
    )
    _GLOBAL_POSTGRES_CONTAINER.start()

    # Extract connection details
    host = _GLOBAL_POSTGRES_CONTAINER.get_container_host_ip()
    port = _GLOBAL_POSTGRES_CONTAINER.get_exposed_port(5432)

    # Set environment variables for application config to use
    os.environ["DATABASE_HOST"] = str(host)
    os.environ["DATABASE_PORT"] = str(port)
    os.environ["POSTGRES_USER"] = "postgres"
    os.environ["POSTGRES_PASSWORD"] = "postgres"
    os.environ["POSTGRES_DB"] = "postgres"

    logger.info("Testcontainers Postgres started: %s:%s", host, port)


def pytest_unconfigure(config: pytest.Config) -> None:
    """Stop Testcontainers after all tests complete."""
    global _GLOBAL_POSTGRES_CONTAINER  # noqa: PLW0603

    if os.environ.get("IN_DOCKER") == "true":
        return

    if _GLOBAL_POSTGRES_CONTAINER:
        logger.info("Stopping Testcontainers Postgres...")
        _GLOBAL_POSTGRES_CONTAINER.stop()
        _GLOBAL_POSTGRES_CONTAINER = None


def _get_worker_test_db_name() -> str:
    """Generate worker-specific test database name for pytest-xdist parallelism."""
    base_name = os.getenv("POSTGRES_TEST_DB", _DEFAULT_TEST_DB_NAME)
    worker_id = os.getenv("PYTEST_XDIST_WORKER")

    db_name = base_name
    if worker_id and worker_id != _MASTER_WORKER:
        db_name = f"{base_name}_{worker_id}"

    if not _SAFE_DB_NAME.match(db_name):
        err = f"Unsafe test database name: {db_name!r}"
        raise ValueError(err)

    return db_name


def _build_database_url(driver: str, database_name: str) -> str:
    """Build database URL from environment variables set by pytest_configure."""
    host = os.environ["DATABASE_HOST"]
    port = os.environ["DATABASE_PORT"]
    user = os.environ["POSTGRES_USER"]
    password = os.environ["POSTGRES_PASSWORD"]

    # When running in Docker (CI), we might need to use 'localhost' if running tests from host,
    # but since tests run INSIDE the container, DATABASE_HOST should already be 'database'.
    return f"postgresql+{driver}://{user}:{password}@{host}:{port}/{database_name}"


def create_test_database(test_database_name: str) -> None:
    """Create the test database. Recreate if it exists."""
    # Connect to default 'postgres' database to create test database
    sync_admin_url = _build_database_url("psycopg", "postgres")
    sync_engine = create_engine(sync_admin_url, isolation_level="AUTOCOMMIT")

    with sync_engine.connect() as connection:
        term_query = text("""
            SELECT pg_terminate_backend(pg_stat_activity.pid)
            FROM pg_stat_activity
            WHERE pg_stat_activity.datname = :db_name
            AND pid <> pg_backend_pid();
        """)
        connection.execute(term_query, {"db_name": test_database_name})

        connection.execute(text(f"DROP DATABASE IF EXISTS {test_database_name}"))
        connection.execute(text(f"CREATE DATABASE {test_database_name}"))

    sync_engine.dispose()
    logger.info("Test database created successfully: %s", test_database_name)


def get_alembic_config(test_database_name: str) -> Config:
    """Get Alembic config for running migrations on the test database schema."""
    sync_test_database_url = _build_database_url("psycopg", test_database_name)

    project_root: Path = Path(__file__).parents[1]
    alembic_cfg = Config(toml_file=str(project_root / "pyproject.toml"))
    alembic_cfg.set_main_option("script_location", str(project_root / "alembic"))
    alembic_cfg.set_main_option("is_test", "true")
    alembic_cfg.set_main_option("sqlalchemy.url", sync_test_database_url)
    return alembic_cfg


@pytest.fixture(scope="session", name="test_database_name")
def _test_database_name_fixture() -> str:
    """Get worker-specific test database name."""
    return _get_worker_test_db_name()


@pytest.fixture(scope="session")
def relab_alembic_config(test_database_name: str) -> Config:
    """Provide Alembic config for integration tests in this repository."""
    return get_alembic_config(test_database_name)


@pytest.fixture(scope="session")
def async_engine(test_database_name: str) -> Generator[AsyncEngine]:
    """Create async engine for test database."""
    async_test_database_url = _build_database_url("asyncpg", test_database_name)

    engine = create_async_engine(
        async_test_database_url,
        echo=False,
        future=True,
        poolclass=NullPool,
    )
    yield engine
    asyncio.run(engine.dispose())


@pytest.fixture(scope="session", autouse=True)
def _setup_test_database(test_database_name: str, async_engine: AsyncEngine) -> Generator[None]:
    """Create test database and run migrations once per test session."""
    create_test_database(test_database_name)

    if os.environ.get("IN_DOCKER") == "true":
        logger.info("Running inside Docker, skipping internal Alembic upgrade...")
        yield
        return

    alembic_cfg = get_alembic_config(test_database_name)
    logger.info("Running Alembic upgrade head...")
    command.upgrade(alembic_cfg, "head")
    logger.info("Alembic upgrade complete.")

    yield

    # Cleanup: drop test database
    sync_admin_url = _build_database_url("psycopg", "postgres")
    sync_engine = create_engine(sync_admin_url, isolation_level="AUTOCOMMIT")
    with sync_engine.connect() as connection:
        term_query = text("""
            SELECT pg_terminate_backend(pg_stat_activity.pid)
            FROM pg_stat_activity
            WHERE pg_stat_activity.datname = :db_name
            AND pid <> pg_backend_pid();
        """)
        connection.execute(term_query, {"db_name": test_database_name})
        connection.execute(text(f"DROP DATABASE IF EXISTS {test_database_name}"))
    sync_engine.dispose()


@pytest.fixture
async def session(_setup_test_database: None, async_engine: AsyncEngine) -> AsyncGenerator[AsyncSession]:
    """Provide isolated database session using transaction rollback."""
    async with async_engine.connect() as connection:
        transaction = await connection.begin()

        session_factory = async_sessionmaker(
            bind=connection,
            class_=AsyncSession,
            autocommit=False,
            autoflush=False,
            expire_on_commit=False,
        )

        async with session_factory() as db_session:
            yield db_session
            if transaction.is_active:
                await transaction.rollback()


@pytest.fixture
def anyio_backend() -> str:
    """Configure anyio backend for async tests."""
    return "asyncio"


@pytest.fixture(autouse=True, scope="session")
def cleanup_loguru() -> Generator[None]:
    """Ensure Loguru background queues are closed cleanly after testing session."""
    yield
    loguru_logger.remove()


@pytest.fixture(autouse=True)
def mock_email_sending(mocker: MockerFixture) -> AsyncMock:
    """Automatically mock email sending for all tests."""
    return mocker.patch(
        "app.api.auth.utils.programmatic_emails.fm.send_message",
        new_callable=AsyncMock,
    )
