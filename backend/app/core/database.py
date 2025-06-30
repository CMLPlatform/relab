"""Database initialization and session management."""

from collections.abc import AsyncGenerator, Generator
from contextlib import asynccontextmanager, contextmanager

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.ext.asyncio.engine import AsyncEngine
from sqlmodel import Session
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import settings

### Async database connection
async_engine: AsyncEngine = create_async_engine(settings.async_database_url, future=True, echo=settings.debug)


async def get_async_session() -> AsyncGenerator[AsyncSession]:
    """Get a new asynchronous database session. Can be used in FastAPI dependencies."""
    async_session = async_sessionmaker(bind=async_engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session


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
