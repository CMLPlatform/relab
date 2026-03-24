"""Database initialization and session management."""

from contextlib import asynccontextmanager, contextmanager
from typing import TYPE_CHECKING

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.ext.asyncio.engine import AsyncEngine
from sqlmodel import Session
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import settings
from app.core.model_registry import load_sqlmodel_models

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator, Generator


# Ensure ORM class registry is populated before sessions are created.
load_sqlmodel_models()

### Async database connection
async_engine: AsyncEngine = create_async_engine(settings.async_database_url, future=True, echo=settings.debug)
async_sessionmaker_factory = async_sessionmaker(bind=async_engine, class_=AsyncSession, expire_on_commit=False)


async def get_async_session() -> AsyncGenerator[AsyncSession]:
    """Get a new asynchronous database session. Can be used in FastAPI dependencies."""
    async with async_sessionmaker_factory() as session:
        yield session


async def close_async_engine() -> None:
    """Dispose the shared async engine and close pooled DB connections."""
    await async_engine.dispose()


# Async session context manager for 'async with' statements
async_session_context = asynccontextmanager(get_async_session)


### Sync database connection
sync_engine = create_engine(settings.sync_database_url, echo=settings.debug)


@contextmanager
def sync_session_context() -> Generator[Session]:
    """Get a new synchronous database session."""
    with Session(sync_engine) as session:
        try:
            yield session
        finally:
            session.close()
