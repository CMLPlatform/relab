"""Test configuration file.

Inspired by https://medium.com/@gnetkov/testing-fastapi-application-with-pytest-57080960fd62.

This configuration supports two testing modes:
1. Testcontainers (USE_TESTCONTAINERS=1): Spins up real PostgreSQL in Docker
2. Local database (default): Uses configured test database

For 2025 best practices, testcontainers is recommended for CI/CD pipelines.
"""

import logging
import os
from collections.abc import AsyncGenerator, Generator
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock

import pytest
from alembic import command
from alembic.config import Config
from app.core.config import settings
from app.core.database import get_async_session
from app.main import app
from httpx import ASGITransport, AsyncClient
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.ext.asyncio.engine import AsyncEngine
from sqlmodel.ext.asyncio.session import AsyncSession

from .factories.emails import EmailContextFactory, EmailDataFactory

# Set up logger
logger: logging.Logger = logging.getLogger(__name__)

# Check if we should use testcontainers
USE_TESTCONTAINERS = os.getenv("USE_TESTCONTAINERS", "0") == "1"


### Testcontainers setup (optional, for full integration testing)
if USE_TESTCONTAINERS:
    from testcontainers.postgres import PostgresContainer

    @pytest.fixture(scope="session")
    def postgres_container() -> Generator[PostgresContainer, None, None]:
        """Start a PostgreSQL container for testing."""
        logger.info("Starting PostgreSQL container...")
        with PostgresContainer("postgres:16-alpine") as postgres:
            yield postgres

    @pytest.fixture(scope="session")
    def test_database_url(postgres_container: PostgresContainer) -> str:
        """Get the database URL from the container."""
        return postgres_container.get_connection_url().replace("psycopg2", "asyncpg")

    @pytest.fixture(scope="session")
    def sync_database_url(postgres_container: PostgresContainer) -> str:
        """Get the sync database URL from the container."""
        return postgres_container.get_connection_url().replace("psycopg2", "psycopg")

else:
    # Use local test database
    @pytest.fixture(scope="session")
    def test_database_url() -> str:
        """Get the test database URL from settings."""
        return settings.async_test_database_url

    @pytest.fixture(scope="session")
    def sync_database_url() -> str:
        """Get the sync test database URL from settings."""
        return settings.sync_test_database_url


### Database setup
@pytest.fixture(scope="session")
def sync_engine(sync_database_url: str) -> Engine:
    """Create sync engine for database setup."""
    return create_engine(sync_database_url, isolation_level="AUTOCOMMIT")


@pytest.fixture(scope="session")
def async_engine(test_database_url: str) -> AsyncEngine:
    """Create async engine for tests."""
    return create_async_engine(test_database_url, echo=settings.debug)


def create_test_database(sync_engine: Engine) -> None:
    """Create the test database if it doesn't exist."""
    if USE_TESTCONTAINERS:
        # Container already has the database
        return

    with sync_engine.connect() as connection:
        try:
            connection.execute(text(f"CREATE DATABASE {settings.postgres_test_db}"))
            logger.info("Test database created successfully.")
        except ProgrammingError:
            logger.info("Test database already exists, continuing...")


def get_alembic_config(test_database_url: str) -> Config:
    """Get Alembic config for tests."""
    alembic_cfg = Config()
    project_root: Path = Path(__file__).parents[1]
    alembic_cfg.set_main_option("script_location", str(project_root / "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", test_database_url)
    return alembic_cfg


@pytest.fixture(scope="session", autouse=True)
def setup_test_database(sync_engine: Engine, test_database_url: str) -> Generator[None, None, None]:
    """Create test database, run migrations, and cleanup after tests."""
    create_test_database(sync_engine)

    # Run migrations
    alembic_cfg: Config = get_alembic_config(test_database_url)
    command.upgrade(alembic_cfg, "head")

    yield

    # Cleanup (only for local database, testcontainer cleans itself up)
    if not USE_TESTCONTAINERS:
        with sync_engine.connect() as connection:
            connection.execute(text(f"DROP DATABASE IF EXISTS {settings.postgres_test_db}"))


### Session fixtures
@pytest.fixture(scope="function")
async def db_session(async_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """Create a new database session for each test and roll it back after the test.

    This ensures test isolation - each test gets a fresh session and any
    changes are rolled back after the test completes.
    """
    async_session_local = async_sessionmaker(
        bind=async_engine, autocommit=False, autoflush=False, class_=AsyncSession, expire_on_commit=False
    )

    async with async_engine.begin() as connection:
        async with async_session_local(bind=connection) as session:
            # Begin nested transaction for rollback
            transaction = await connection.begin_nested()
            yield session
            await transaction.rollback()


### HTTP client fixtures
@pytest.fixture(scope="function")
async def async_client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Provide an async HTTP client for API testing.

    This is the modern approach for FastAPI testing (2025 best practice).
    Uses httpx.AsyncClient instead of TestClient for full async support.
    """

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_async_session] = override_get_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client

    app.dependency_overrides.clear()


### Email fixtures
@pytest.fixture
def email_context() -> dict[str, Any]:
    """Return a realistic email template context dict using FactoryBoy/Faker."""
    return EmailContextFactory()


@pytest.fixture
def email_data() -> dict[str, Any]:
    """Return realistic test data for email functions using FactoryBoy/Faker."""
    return EmailDataFactory()


@pytest.fixture
def mock_smtp() -> AsyncMock:
    """Return a configured mock SMTP client for testing email sending."""
    mock = AsyncMock()
    mock.connect = AsyncMock()
    mock.login = AsyncMock()
    mock.send_message = AsyncMock()
    mock.quit = AsyncMock()
    return mock


@pytest.fixture
def mock_email_sender(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    """Mock the fastapi-mail send_message function for all email tests.

    This fixture automatically patches fm.send_message so tests don't need
    to manually patch it with context managers.

    Returns:
        AsyncMock: The mocked send_message function

    Usage:
        @pytest.mark.asyncio
        async def test_send_email(mock_email_sender):
            await send_registration_email("test@example.com", "user", "token")
            mock_email_sender.assert_called_once()
    """
    mock_send = AsyncMock()
    monkeypatch.setattr("app.api.auth.utils.programmatic_emails.fm.send_message", mock_send)
    return mock_send
