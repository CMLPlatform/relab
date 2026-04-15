"""Programmatic user-creation helpers built on top of FastAPI Users."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

from fastapi_users.exceptions import InvalidPasswordException, UserAlreadyExists

from app.api.auth.services.user_manager import get_user_db, get_user_manager
from app.core.database import async_session_context

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User
    from app.api.auth.schemas import UserCreate
    from app.api.auth.services.user_manager import UserManager

get_async_user_db_context = asynccontextmanager(get_user_db)
get_async_user_manager_context = asynccontextmanager(get_user_manager)


@asynccontextmanager
async def get_chained_async_user_manager_context(
    session: AsyncSession | None = None,
) -> AsyncGenerator[UserManager]:
    """Yield a user manager, optionally reusing an existing database session."""
    if session is not None:
        async with (
            get_async_user_db_context(session) as user_db,
            get_async_user_manager_context(user_db) as user_manager,
        ):
            yield user_manager
        return

    async with (
        async_session_context() as db_session,
        get_async_user_db_context(db_session) as user_db,
        get_async_user_manager_context(user_db) as user_manager,
    ):
        yield user_manager


async def create_user(
    async_session: AsyncSession,
    user_create: UserCreate,
    *,
    send_registration_email: bool = False,
    skip_breach_check: bool = False,
    skip_password_validation: bool = False,
) -> User:
    """Programmatically create a new user in the database."""
    try:
        async with get_chained_async_user_manager_context(async_session) as user_manager:
            user_manager.skip_breach_check = skip_breach_check
            user_manager.skip_password_validation = skip_password_validation
            user: User = await user_manager.create(user_create)

            if send_registration_email:
                await user_manager.request_verify(user)

            return user

    except UserAlreadyExists:
        err_msg = f"User with email {user_create.email} already exists."
        raise UserAlreadyExists(err_msg) from None
    except InvalidPasswordException as e:
        err_msg = f"Password is invalid: {e.reason}."
        raise InvalidPasswordException(err_msg) from e
