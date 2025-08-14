"""Test configuration file.

Inspired by https://medium.com/@gnetkov/testing-fastapi-application-with-pytest-57080960fd62.
"""

import logging
from collections.abc import AsyncGenerator, Generator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from app.core.config import settings
from app.main import app
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.ext.asyncio.engine import AsyncEngine
from sqlmodel.ext.asyncio.session import AsyncSession

# Set up logger
logger: logging.Logger = logging.getLogger(__name__)

# Set up sync engine for test database construction
sync_engine: Engine = create_engine(settings.sync_database_url, isolation_level="AUTOCOMMIT")

# Set up an async test engine for the actual
TEST_SQLALCHEMY_DATABASE_URL: str = settings.async_test_database_url
TEST_DATABASE_NAME: str = settings.postgres_test_db
async_engine: AsyncEngine = create_async_engine(TEST_SQLALCHEMY_DATABASE_URL, echo=settings.debug)

async_session_local = async_sessionmaker(
    bind=async_engine, autocommit=False, autoflush=False, class_=AsyncSession, expire_on_commit=False
)


### Set up bare test database using sync engine
def create_test_database() -> None:
    """Create the test database if it doesn't exist."""
    with sync_engine.connect() as connection:
        try:
            connection.execute(text(f"CREATE DATABASE {TEST_DATABASE_NAME}"))
            logger.info("Test database created successfully.")
        except ProgrammingError:
            logger.info("Test database already exists, continuing...")


def get_alembic_config() -> Config:
    """Get Alembic config for tests."""
    alembic_cfg = Config()
    project_root: Path = Path(__file__).parents[1]
    alembic_cfg.set_main_option("script_location", str(project_root / "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", TEST_SQLALCHEMY_DATABASE_URL)
    return alembic_cfg


@pytest.fixture(scope="session", autouse=True)
def setup_test_database() -> Generator:
    """Create test database, run migrations, and cleanup after tests."""
    create_test_database()  # Create empty database

    # Run migrations
    alembic_cfg: Config = get_alembic_config()
    command.upgrade(alembic_cfg, "head")

    yield

    # Cleanup
    with sync_engine.connect() as connection:
        connection.execute(text("DROP DATABASE IF EXISTS " + TEST_DATABASE_NAME))


### Async test session generators
@pytest.fixture(scope="function")
async def get_async_session() -> AsyncGenerator[AsyncSession]:
    """Create a new database session for each test and roll it back after the test."""
    async with async_engine.begin() as connection, async_session_local(bind=connection) as session:
        transaction = await connection.begin_nested()
        yield session
        await transaction.rollback()


@pytest.fixture(scope="function")
async def client(db: AsyncSession) -> AsyncGenerator[TestClient]:
    """Provide a TestClient that uses the test database session."""

    async def override_get_db() -> AsyncGenerator[AsyncSession]:
        yield db

    app.dependency_overrides[get_async_session] = override_get_db

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()
