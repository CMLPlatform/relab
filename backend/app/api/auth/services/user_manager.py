"""User management service."""

import logging
from typing import TYPE_CHECKING, cast

from fastapi import Depends
from fastapi.security import OAuth2PasswordRequestForm
from fastapi_users import FastAPIUsers, UUIDIDMixin, schemas
from fastapi_users.manager import BaseUserManager
from pydantic import UUID4, EmailStr, SecretStr, TypeAdapter, ValidationError
from sqlalchemy import select

from app.api.auth.config import settings as auth_settings
from app.api.auth.crud.users import update_user_override
from app.api.auth.models import User
from app.api.auth.schemas import UserCreate, UserUpdate
from app.api.auth.services import refresh_token_service
from app.api.auth.services.auth_backends import build_authentication_backends
from app.api.auth.services.emails import (
    send_post_verification_email,
    send_reset_password_email,
    send_verification_email,
)
from app.api.auth.services.login_hooks import (
    log_successful_login,
    maybe_set_refresh_token_cookie,
    update_last_login_metadata,
)
from app.api.auth.services.password_validator import validate_password as _validate_password
from app.api.auth.services.user_database import get_user_db
from app.api.common.routers.dependencies import get_external_http_client
from app.core.logging import sanitize_log_value
from app.core.runtime import get_request_services

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from fastapi_users.authentication import AuthenticationBackend
    from fastapi_users.jwt import SecretType
    from httpx import AsyncClient
    from starlette.requests import Request
    from starlette.responses import Response

    from app.api.auth.services.user_database import UserDatabaseAsync
# Set up logging
logger = logging.getLogger(__name__)

# Declare constants
SECRET: SecretStr = auth_settings.fastapi_users_secret
ACCESS_TOKEN_TTL = auth_settings.access_token_ttl_seconds
RESET_TOKEN_TTL = auth_settings.reset_password_token_ttl_seconds
VERIFICATION_TOKEN_TTL = auth_settings.verification_token_ttl_seconds


class UserManager(UUIDIDMixin, BaseUserManager[User, UUID4]):  # spell-checker: ignore UUIDID
    """User manager class for FastAPI-Users."""

    # We will initialize the user manager with a UserDatabaseAsync instance in the dependency function below
    user_db: UserDatabaseAsync

    def __init__(self, user_db: UserDatabaseAsync, http_client: AsyncClient) -> None:
        super().__init__(user_db)
        self.http_client = http_client
        self.skip_breach_check = False
        self.skip_password_validation = False

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
            # Not a valid email; fall through to username lookup below.
            pass

        if not is_email:
            statement = select(User).where(User.username == credentials.username)
            result = await self.user_db.session.execute(statement)
            db_user = result.scalars().unique().one_or_none()
            if db_user:
                credentials.username = db_user.email
        return await super().authenticate(credentials)

    async def validate_password(
        self,
        password: str | SecretStr,
        user: UserCreate | User,
    ) -> None:
        """Delegate password validation to the dedicated service."""
        if self.skip_password_validation:
            return
        await _validate_password(
            password,
            email=user.email,
            username=getattr(user, "username", None),
            http_client=self.http_client,
            skip_breach_check=self.skip_breach_check,
        )

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

    async def on_after_update(self, user: User, update_dict: dict, request: Request | None = None) -> None:
        """Revoke all refresh tokens when a user is deactivated."""
        if update_dict.get("is_active") is False:
            redis = get_request_services(request).redis if request else None
            await refresh_token_service.revoke_all_user_tokens(redis, user.id)

    async def on_after_login(
        self, user: User, request: Request | None = None, response: Response | None = None
    ) -> None:
        """Update last login timestamp, create refresh token and session after successful authentication."""
        await update_last_login_metadata(user, request, self.user_db.session)
        await maybe_set_refresh_token_cookie(user, request, response)
        log_successful_login(user)


async def get_user_manager(
    user_db: UserDatabaseAsync[User, UUID4] = Depends(get_user_db),
    http_client: AsyncClient = Depends(get_external_http_client),
) -> AsyncGenerator[UserManager]:
    """Async generator for the user manager."""
    yield UserManager(user_db, http_client)


bearer_auth_backend: AuthenticationBackend[User, UUID4]
cookie_auth_backend: AuthenticationBackend[User, UUID4]
bearer_auth_backend, cookie_auth_backend = build_authentication_backends()

# User manager singleton
fastapi_user_manager = FastAPIUsers[User, UUID4](get_user_manager, [bearer_auth_backend, cookie_auth_backend])
