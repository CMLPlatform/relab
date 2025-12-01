"""Async context managers for user database and user manager."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.auth.services.user_manager import get_user_db, get_user_manager
from app.core.database import async_session_context

if TYPE_CHECKING:
    from app.api.auth.services.user_manager import UserManager

get_async_user_db_context = asynccontextmanager(get_user_db)
get_async_user_manager_context = asynccontextmanager(get_user_manager)


@asynccontextmanager
async def get_chained_async_user_manager_context(
    session: AsyncSession | None = None,
) -> AsyncGenerator[UserManager]:
    """Provides a user manager context using the user database and an async database session.

    If a session is provided, it will be used; otherwise, a new session for the default database will be created.
    """
    if session is not None:
        async with (
            get_async_user_db_context(session) as user_db,
            get_async_user_manager_context(user_db) as user_manager,
        ):
            yield user_manager
    else:
        async with (
            async_session_context() as db_session,
            get_async_user_db_context(db_session) as user_db,
            get_async_user_manager_context(user_db) as user_manager,
        ):
            yield user_manager
