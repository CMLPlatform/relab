"""Custom CRUD operations for the User model, on top of the standard FastAPI-Users implementation."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import exists, select

from app.api.auth.exceptions import DisposableEmailError, UserNameAlreadyExistsError
from app.api.auth.models import User
from app.api.auth.preferences import merge_user_preferences
from app.api.auth.schemas import UserCreateBase, UserUpdate
from app.api.common.exceptions import BadRequestError, NotFoundError

USERNAME_FIELD = "username"

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.services.email_checker import EmailChecker
    from app.api.auth.services.user_database import UserDatabaseAsync


## Create User ##
async def validate_user_create[UserCreateT: UserCreateBase](
    user_db: UserDatabaseAsync,
    user_create: UserCreateT,
    email_checker: EmailChecker | None = None,
) -> UserCreateT:
    """Override of base user creation with additional username uniqueness check.

    Meant for use within the on_after_register event in FastAPI-Users UserManager.
    """
    if email_checker and await email_checker.is_disposable(user_create.email):
        raise DisposableEmailError(email=user_create.email)

    if user_create.username is not None:
        query = select(exists().where(User.username == user_create.username))
        if (await user_db.session.execute(query)).scalar_one():
            raise UserNameAlreadyExistsError(user_create.username)

    return user_create


## Read User ##
async def get_user_by_username(session: AsyncSession, username: str) -> User:
    """Get a user by their username."""
    statement = select(User).where(User.username == username)

    if not (user := (await session.execute(statement)).scalars().unique().one_or_none()):
        err_msg = f"User not found with username: {username}"
        raise NotFoundError(err_msg)
    return user


## Update User ##
async def update_user_override(user_db: UserDatabaseAsync, user: User, user_update: UserUpdate) -> UserUpdate:
    """Override base user update with username validation and preference merging."""
    if USERNAME_FIELD in user_update.model_fields_set and user_update.username is None:
        err_msg = "Username cannot be cleared"
        raise BadRequestError(err_msg)

    if user_update.username is not None:
        # Check username uniqueness
        query = select(exists().where((User.username == user_update.username) & (User.id != user.id)))
        if (await user_db.session.execute(query)).scalar_one():
            raise UserNameAlreadyExistsError(user_update.username)

    # Merge preferences (shallow) instead of replacing the whole dict
    if user_update.preferences is not None:
        user_update.preferences = merge_user_preferences(
            user.preferences,
            user_update.preferences,
        ).model_dump(mode="json")

    return user_update
