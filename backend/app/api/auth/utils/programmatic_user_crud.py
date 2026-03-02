"""Programmatic CRUD operations for FastAPI-users."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi_users.exceptions import InvalidPasswordException, UserAlreadyExists

from app.api.auth.utils.context_managers import get_chained_async_user_manager_context

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.api.auth.models import User
    from app.api.auth.schemas import UserCreate


async def create_user(
    async_session: AsyncSession, user_create: UserCreate, *, send_registration_email: bool = False
) -> User:
    """Programmatically create a new user in the database.

    Args:
        async_session: Database session
        user_create: User creation schema
        send_registration_email: Whether to send verification email to the user

    Returns:
        Created user instance

    Raises:
        UserAlreadyExists: If user with email already exists
        InvalidPasswordException: If password validation fails
    """
    try:
        async with get_chained_async_user_manager_context(async_session) as user_manager:
            # Create user (password hashing and validation handled by UserManager)
            user: User = await user_manager.create(user_create)

            # Send verification email if requested
            if send_registration_email:
                await user_manager.request_verify(user)

            return user

    except UserAlreadyExists:
        err_msg: str = f"User with email {user_create.email} already exists."
        raise UserAlreadyExists(err_msg) from None
    except InvalidPasswordException as e:
        err_msg: str = f"Password is invalid: {e.reason}."
        raise InvalidPasswordException(err_msg) from e
