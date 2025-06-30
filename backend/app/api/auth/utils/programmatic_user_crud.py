"""Programmatic CRUD operations for FastAPI-users."""

from fastapi_users.exceptions import InvalidPasswordException, UserAlreadyExists
from sqlmodel.ext.asyncio.session import AsyncSession
from starlette.requests import Request

from app.api.auth.models import User
from app.api.auth.schemas import UserCreate
from app.api.auth.utils.context_managers import get_chained_async_user_manager_context


async def create_user(
    async_session: AsyncSession, user_create: UserCreate, *, send_registration_email: bool = False
) -> User:
    """Programmatically create a new user in the database."""
    try:
        async with get_chained_async_user_manager_context(async_session) as user_manager:
            # HACK: Synthetic request to avoid sending emails for programmatically created users
            request = Request(scope={"type": "http"})
            request._body = b"{}"
            request.state.send_registration_email = send_registration_email

            user: User = await user_manager.create(user_create, request=request)
            return user
    except UserAlreadyExists:
        err_msg: str = f"User with email {user_create.email} already exists."
        raise UserAlreadyExists(err_msg) from None
    except InvalidPasswordException as e:
        err_msg: str = f"Password is invalid: {e.reason}."
        raise InvalidPasswordException(err_msg) from e
