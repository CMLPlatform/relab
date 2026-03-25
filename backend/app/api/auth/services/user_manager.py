"""User management service."""

import logging
from typing import TYPE_CHECKING, cast

from fastapi import Depends
from fastapi.security import OAuth2PasswordRequestForm
from fastapi_users import FastAPIUsers, InvalidPasswordException, UUIDIDMixin, schemas
from fastapi_users.manager import BaseUserManager
from pydantic import UUID4, EmailStr, SecretStr, TypeAdapter, ValidationError
from sqlmodel import select

from app.api.auth.config import settings as auth_settings
from app.api.auth.crud.users import update_user_override
from app.api.auth.models import User
from app.api.auth.schemas import UserCreate, UserUpdate
from app.api.auth.services.auth_backends import build_authentication_backends
from app.api.auth.services.login_hooks import (
    log_successful_login,
    maybe_set_refresh_token_cookie,
    update_last_login_metadata,
)
from app.api.auth.services.user_db import get_user_db
from app.api.auth.utils.programmatic_emails import (
    send_post_verification_email,
    send_reset_password_email,
    send_verification_email,
)
from app.core.logging import sanitize_log_value

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from fastapi_users.authentication import AuthenticationBackend
    from fastapi_users.jwt import SecretType
    from fastapi_users_db_sqlmodel import SQLModelUserDatabaseAsync
    from starlette.requests import Request
    from starlette.responses import Response

# Set up logging
logger = logging.getLogger(__name__)

# Declare constants
SECRET: SecretStr = auth_settings.fastapi_users_secret
ACCESS_TOKEN_TTL = auth_settings.access_token_ttl_seconds
RESET_TOKEN_TTL = auth_settings.reset_password_token_ttl_seconds
VERIFICATION_TOKEN_TTL = auth_settings.verification_token_ttl_seconds


_AUTH_COOKIE_PREFIX = "auth="
_SET_COOKIE_HEADER = "set-cookie"


class UserManager(UUIDIDMixin, BaseUserManager[User, UUID4]):  # spell-checker: ignore UUIDID
    """User manager class for FastAPI-Users."""

    # We will initialize the user manager with a SQLModelUserDatabaseAsync instance in the dependency function below
    user_db: SQLModelUserDatabaseAsync

    # Set up token secrets and lifetimes
    reset_password_token_secret: SecretType = SECRET.get_secret_value()
    reset_password_token_lifetime_seconds = RESET_TOKEN_TTL

    verification_token_secret: SecretType = SECRET.get_secret_value()
    verification_token_lifetime_seconds = VERIFICATION_TOKEN_TTL

    async def authenticate(self, credentials: OAuth2PasswordRequestForm) -> User | None:
        """Support login with either email or username."""
        is_email = False
        try:
            TypeAdapter(EmailStr).validate_python(credentials.username)
            is_email = True
        except ValidationError:
            pass

        if not is_email:
            statement = select(User).where(User.username == credentials.username)
            result = await self.user_db.session.exec(statement)
            db_user = result.unique().one_or_none()
            if db_user:
                credentials.username = db_user.email
        return await super().authenticate(credentials)

    async def validate_password(
        self,
        password: str | SecretStr,
        user: UserCreate | User,
    ) -> None:
        """Validate password meets security requirements."""
        if isinstance(password, SecretStr):
            password = password.get_secret_value()
        if len(password) < 8:
            raise InvalidPasswordException(reason="Password should be at least 8 characters")
        if user.email in password:
            raise InvalidPasswordException(reason="Password should not contain e-mail")
        if user.username and user.username in password:
            raise InvalidPasswordException(reason="Password should not contain username")
        if user.username and user.username in password:
            raise InvalidPasswordException(reason="Password should not contain username")

    async def update(
        self,
        user_update: schemas.UU,
        user: User,
        safe: bool = False,  # noqa: FBT002, FBT001 # Expected by parent class signature
        request: Request | None = None,
    ) -> User:
        """Update a user, injecting custom organization & username validation first."""
        # Will raise exceptions like UserNameAlreadyExistsError if validation fails
        real_user_update = cast("UserUpdate", user_update)
        real_user_update = await update_user_override(self.user_db, user, real_user_update)
        user_update = cast("schemas.UU", real_user_update)

        # Proceed with base FastAPI User update logic
        return await super().update(user_update, user, safe=safe, request=request)

    async def on_after_request_verify(self, user: User, token: str, request: Request | None = None) -> None:  # noqa: ARG002 # Request argument is expected in the method signature
        """Send verification email after verification is requested."""
        await send_verification_email(user.email, user.username, token)
        logger.info("Verification email sent to user %s", sanitize_log_value(user.email))

    async def on_after_verify(self, user: User, request: Request | None = None) -> None:  # noqa: ARG002 # Request argument is expected in the method signature
        """Send welcome email after user verifies their email."""
        logger.info("User %s has been verified.", sanitize_log_value(user.email))
        await send_post_verification_email(user.email, user.username)

    async def on_after_forgot_password(self, user: User, token: str, request: Request | None = None) -> None:  # noqa: ARG002 # Request argument is expected in the method signature
        """Send password reset email."""
        logger.info("User %s has forgot their password. Sending reset token", sanitize_log_value(user.email))
        await send_reset_password_email(user.email, user.username, token)

    async def on_after_login(
        self, user: User, request: Request | None = None, response: Response | None = None
    ) -> None:
        """Update last login timestamp, create refresh token and session after successful authentication."""
        await update_last_login_metadata(user, request, self.user_db.session)
        await maybe_set_refresh_token_cookie(user, request, response)
        log_successful_login(user)


async def get_user_manager(
    user_db: SQLModelUserDatabaseAsync[User, UUID4] = Depends(get_user_db),
) -> AsyncGenerator[UserManager]:
    """Async generator for the user manager."""
    yield UserManager(user_db)


bearer_auth_backend: AuthenticationBackend[User, UUID4]
cookie_auth_backend: AuthenticationBackend[User, UUID4]
bearer_auth_backend, cookie_auth_backend = build_authentication_backends()

# User manager singleton
fastapi_user_manager = FastAPIUsers[User, UUID4](get_user_manager, [bearer_auth_backend, cookie_auth_backend])
