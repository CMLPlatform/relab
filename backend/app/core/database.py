"""Async database initialization and session management."""

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.ext.asyncio.engine import AsyncEngine
from sqlmodel.ext.asyncio.session import AsyncSession as SQLModelAsyncSession

from app.core.config import settings
from app.core.model_registry import load_sqlmodel_models

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator


# Ensure ORM class registry is populated before sessions are created.
load_sqlmodel_models()

### Async database connection
async_engine: AsyncEngine = create_async_engine(
    settings.async_database_url,
    future=True,
    echo=settings.debug,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_pool_max_overflow,
)
# Use SQLModel's AsyncSession subclass (adds .exec()) as a bridge while rpi_cam
# plugin still uses .exec(). Remove this once rpi_cam is migrated to .execute().
async_sessionmaker_factory = async_sessionmaker(bind=async_engine, class_=SQLModelAsyncSession, expire_on_commit=False)


async def get_async_session() -> AsyncGenerator[AsyncSession]:
    """Get a new asynchronous database session. Can be used in FastAPI dependencies."""
    async with async_sessionmaker_factory() as session:
        yield session


async def close_async_engine() -> None:
    """Dispose the shared async engine and close pooled DB connections."""
    await async_engine.dispose()


# Async session context manager for 'async with' statements
async_session_context = asynccontextmanager(get_async_session)
