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
- Testcontainers starts lazily when a DB-backed fixture is first requested
- Container coordinates are written to environment variables
- Application settings load from these env vars when DB fixtures build URLs
- This keeps pure unit test runs from paying the Docker startup cost
"""

from __future__ import annotations

# spell-checker: ignore datname, collectonly
import asyncio
import logging
import os
import re
import sys
from contextlib import suppress
from pathlib import Path
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

# Ensure settings modules load from .env.test before any app imports happen.
# This must run before pytest_plugins triggers fixture-module imports and before
# importing app modules that instantiate settings at module level.
os.environ.setdefault("ENVIRONMENT", "testing")

import pytest
from alembic import command
from alembic.config import Config
from loguru import logger as loguru_logger
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool
from testcontainers.postgres import PostgresContainer

from app.core.logging import LOG_FORMAT, setup_logging

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator, Generator

    from pytest_mock import MockerFixture

logger = logging.getLogger(__name__)

pytest_plugins = [
    "tests.fixtures.client",
    "tests.fixtures.data",
    "tests.fixtures.database",
    "tests.fixtures.migrations",
    "tests.fixtures.redis",
]

_DEFAULT_TEST_DB_NAME = "test_relab"
_MASTER_WORKER = "master"
_SAFE_DB_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


# Global container instance for entire test session
class _PostgresContainerState:
    """Mutable holder for the session Postgres container."""

    container: PostgresContainer | None = None


_POSTGRES_CONTAINER_STATE = _PostgresContainerState()


def pytest_configure(config: pytest.Config) -> None:
    """Configure logging before test collection."""
    if config.option.collectonly:
        return

    # Initialize logging for the test session
    setup_logging()
    # Remove all sinks initially to prevent logs from bypassing pytest's capture/filtering
    loguru_logger.remove()

    # If -s (no capture) is active, add back a stderr sink for live output
    if config.getoption("capture") == "no":
        loguru_logger.add(sys.stderr, format=LOG_FORMAT, level="INFO")


def _ensure_testcontainers_postgres() -> None:
    """Start Testcontainers Postgres once and publish its coordinates."""
    if _POSTGRES_CONTAINER_STATE.container is not None:
        return

    logger.info("Starting Testcontainers Postgres...")
    _POSTGRES_CONTAINER_STATE.container = PostgresContainer(
        "postgres:18-alpine",
        username="postgres",
        password="postgres",  # Test-password only
        dbname="postgres",
    )
    _POSTGRES_CONTAINER_STATE.container.start()

    host = _POSTGRES_CONTAINER_STATE.container.get_container_host_ip()
    port = _POSTGRES_CONTAINER_STATE.container.get_exposed_port(5432)

    os.environ["DATABASE_HOST"] = str(host)
    os.environ["DATABASE_PORT"] = str(port)
    os.environ["POSTGRES_USER"] = "postgres"
    os.environ["POSTGRES_PASSWORD"] = "postgres"  # Test-password only
    os.environ["POSTGRES_DB"] = "postgres"

    logger.info("Testcontainers Postgres started: %s:%s", host, port)


def pytest_unconfigure(config: pytest.Config) -> None:
    """Stop Testcontainers after all tests complete."""
    del config
    if _POSTGRES_CONTAINER_STATE.container:
        logger.info("Stopping Testcontainers Postgres...")
        _POSTGRES_CONTAINER_STATE.container.stop()
        _POSTGRES_CONTAINER_STATE.container = None


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
    port = int(os.environ["DATABASE_PORT"])
    user = os.environ["POSTGRES_USER"]
    password = os.environ["POSTGRES_PASSWORD"]
    return URL.create(
        f"postgresql+{driver}",
        username=user,
        password=password,
        host=host,
        port=port,
        database=database_name,
    ).render_as_string(hide_password=False)


def _drop_test_database(test_database_name: str) -> None:
    """Terminate connections and drop the test database."""
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


def create_test_database(test_database_name: str) -> None:
    """Create the test database. Recreate if it exists."""
    _drop_test_database(test_database_name)

    sync_admin_url = _build_database_url("psycopg", "postgres")
    sync_engine = create_engine(sync_admin_url, isolation_level="AUTOCOMMIT")
    with sync_engine.connect() as connection:
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
    _ensure_testcontainers_postgres()
    return _get_worker_test_db_name()


@pytest.fixture(scope="session")
def relab_alembic_config(_setup_test_database: None, test_database_name: str) -> Config:
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


@pytest.fixture(scope="session")
def _setup_test_database(test_database_name: str) -> Generator[None]:
    """Create test database and run migrations once per test session."""
    create_test_database(test_database_name)

    alembic_cfg = get_alembic_config(test_database_name)
    logger.info("Running Alembic upgrade head...")
    command.upgrade(alembic_cfg, "head")
    logger.info("Alembic upgrade complete.")

    yield

    _drop_test_database(test_database_name)


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
        "app.api.auth.services.emails.fm.send_message",
        new_callable=AsyncMock,
    )


@pytest.fixture(autouse=True)
def caplog_loguru(caplog: pytest.LogCaptureFixture) -> Generator[None]:
    """Propagate Loguru logs to Pytest's caplog handler.

    This allows loguru logs to be captured by pytest and shown in the CLI
    according to the log_cli settings in pyproject.toml.
    """
    sink_id = loguru_logger.add(
        caplog.handler,
        format="{message}",
        level=0,
        filter=lambda record: record["level"].no >= caplog.handler.level,
    )
    yield
    with suppress(ValueError):
        loguru_logger.remove(sink_id)
