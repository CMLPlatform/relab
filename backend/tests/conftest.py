"""Root test configuration with containerized Postgres test database setup.

This conftest provides:
- Ephemeral Postgres via Testcontainers (session-scoped)
- Database setup with transaction isolation
- Cross-suite logging glue
- Minimal global safety fixtures

Key Fixtures:
- db_session: Isolated async database session with transaction rollback

Architecture:
- Testcontainers starts lazily when a DB-backed fixture is first requested
- Container coordinates are written to environment variables
- Application settings load from these env vars when DB fixtures build URLs
- This keeps pure unit test runs from paying the Docker startup cost
"""

# spell-checker: ignore datname, collectonly, workerinput
import asyncio
import logging
import os
import re
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
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool
from testcontainers.postgres import PostgresContainer

from app.core.logging import setup_logging

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator, Generator

    from pytest_mock import MockerFixture

logger = logging.getLogger(__name__)

pytest_plugins = [
    "tests.fixtures.auth",
    "tests.fixtures.client",
    "tests.fixtures.data",
    "tests.fixtures.migrations",
    "tests.fixtures.redis",
]

_DEFAULT_TEST_DB_NAME = "test_relab"
_MASTER_WORKER = "master"
_SAFE_DB_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


_postgres_container: PostgresContainer | None = None
# Set on xdist workers: coordinates for the single container the controller owns,
# so a worker never spins up (nor tears down) its own Postgres.
_external_container = False


def _is_xdist_worker(config: pytest.Config) -> bool:
    return hasattr(config, "workerinput")


def _xdist_active(config: pytest.Config) -> bool:
    return bool(getattr(config.option, "numprocesses", None))


def _absorb_shared_container_coords(config: pytest.Config) -> None:
    """Reuse the controller's shared Postgres container on an xdist worker."""
    global _external_container
    workerinput = config.workerinput  # type: ignore[attr-defined]  # present on xdist workers
    os.environ["DATABASE_HOST"] = workerinput["relab_db_host"]
    os.environ["DATABASE_PORT"] = workerinput["relab_db_port"]
    os.environ["POSTGRES_USER"] = "postgres"
    os.environ["POSTGRES_PASSWORD"] = "postgres"  # Test-password only
    os.environ["POSTGRES_DB"] = "postgres"
    _external_container = True


def pytest_configure(config: pytest.Config) -> None:
    """Configure logging before test collection."""
    if config.option.collectonly:
        return

    # Initialize logging for the test session
    setup_logging()

    if _is_xdist_worker(config):
        # Worker: reuse the single container the controller already started.
        _absorb_shared_container_coords(config)
    elif _xdist_active(config):
        # Controller under xdist: start one shared container eagerly so its
        # coordinates can be handed to every worker via pytest_configure_node.
        # (Non-xdist runs stay lazy — see _ensure_testcontainers_postgres — so
        # unit-only runs never pay the Docker startup cost.)
        _ensure_testcontainers_postgres()


def pytest_configure_node(node: object) -> None:
    """Hand the shared container's coordinates to each xdist worker (controller-side hook)."""
    node.workerinput["relab_db_host"] = os.environ["DATABASE_HOST"]  # type: ignore[attr-defined]
    node.workerinput["relab_db_port"] = os.environ["DATABASE_PORT"]  # type: ignore[attr-defined]


def _ensure_testcontainers_postgres() -> None:
    """Start Testcontainers Postgres once and publish its coordinates."""
    global _postgres_container
    if _postgres_container is not None or _external_container:
        return

    logger.info("Starting Testcontainers Postgres...")
    _postgres_container = PostgresContainer(
        "postgres:18-alpine",
        username="postgres",
        password="postgres",  # Test-password only
        dbname="postgres",
    )
    _postgres_container.start()

    host = _postgres_container.get_container_host_ip()
    port = _postgres_container.get_exposed_port(5432)

    os.environ["DATABASE_HOST"] = str(host)
    os.environ["DATABASE_PORT"] = str(port)
    os.environ["POSTGRES_USER"] = "postgres"
    os.environ["POSTGRES_PASSWORD"] = "postgres"  # Test-password only
    os.environ["POSTGRES_DB"] = "postgres"

    logger.info("Testcontainers Postgres started: %s:%s", host, port)


def _validate_test_database_name(database_name: str) -> str:
    """Return a validated test database name."""
    if not _SAFE_DB_NAME.fullmatch(database_name):
        err = f"Unsafe test database name: {database_name!r}"
        raise ValueError(err)
    return database_name


def _quoted_test_database_identifier(database_name: str) -> str:
    """Return a quoted test database identifier after validating the allowlist."""
    return f'"{_validate_test_database_name(database_name)}"'


def pytest_unconfigure(config: pytest.Config) -> None:
    """Stop Testcontainers after all tests complete."""
    global _postgres_container
    del config
    if _postgres_container:
        logger.info("Stopping Testcontainers Postgres...")
        _postgres_container.stop()
        _postgres_container = None


def _get_worker_test_db_name() -> str:
    """Generate worker-specific test database name for pytest-xdist parallelism."""
    base_name = os.getenv("POSTGRES_TEST_DB", _DEFAULT_TEST_DB_NAME)
    worker_id = os.getenv("PYTEST_XDIST_WORKER")

    db_name = base_name
    if worker_id and worker_id != _MASTER_WORKER:
        db_name = f"{base_name}_{worker_id}"

    return _validate_test_database_name(db_name)


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
        quoted_db_name = _quoted_test_database_identifier(test_database_name)
        connection.exec_driver_sql(f"DROP DATABASE IF EXISTS {quoted_db_name}")

    sync_engine.dispose()


def create_test_database(test_database_name: str) -> None:
    """Create the test database. Recreate if it exists."""
    _drop_test_database(test_database_name)

    sync_admin_url = _build_database_url("psycopg", "postgres")
    sync_engine = create_engine(sync_admin_url, isolation_level="AUTOCOMMIT")
    with sync_engine.connect() as connection:
        quoted_db_name = _quoted_test_database_identifier(test_database_name)
        connection.exec_driver_sql(f"CREATE DATABASE {quoted_db_name}")
    sync_engine.dispose()

    logger.info("Test database created successfully: %s", test_database_name)


def get_alembic_config(test_database_name: str) -> Config:
    """Get Alembic config for running migrations on the test database schema."""
    sync_test_database_url = _build_database_url("psycopg", test_database_name)

    project_root: Path = Path(__file__).parents[1]
    alembic_cfg = Config(toml_file=str(project_root / "pyproject.toml"))
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
async def db_session(_setup_test_database: None, async_engine: AsyncEngine) -> AsyncGenerator[AsyncSession]:
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


@pytest.fixture(autouse=True)
def mock_email_sending(mocker: MockerFixture) -> AsyncMock:
    """Automatically mock email sending for all tests."""
    return mocker.patch(
        "app.api.auth.services.email.service.default_email_provider.send",
        new_callable=AsyncMock,
    )
