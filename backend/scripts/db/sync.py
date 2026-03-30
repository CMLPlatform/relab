"""Synchronous database helpers for scripts and migration-related tasks."""

from contextlib import contextmanager
from typing import TYPE_CHECKING

from sqlmodel import Session, create_engine

from app.core.config import settings

if TYPE_CHECKING:
    from collections.abc import Generator


sync_engine = create_engine(settings.sync_database_url, echo=settings.debug)


@contextmanager
def sync_session_context() -> Generator[Session]:
    """Get a synchronous database session for scripts."""
    with Session(sync_engine) as session:
        try:
            yield session
        finally:
            session.close()
