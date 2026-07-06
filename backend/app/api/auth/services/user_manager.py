"""User management service."""

import logging
from typing import TYPE_CHECKING, cast

from fastapi import Depends, params
from fastapi.security import OAuth2PasswordRequestForm
from fastapi_users import FastAPIUsers, UUIDIDMixin, schemas
from fastapi_users.manager import BaseUserManager
from pydantic import UUID4, EmailStr, SecretStr, TypeAdapter, ValidationError
from sqlalchemy import select

from app.api.auth.config import settings as auth_settings
from app.api.auth.crud import update_user_override
from app.api.auth.models import User
from app.api.auth.runtime_dependencies import get_common_password_checker
from app.api.auth.schemas import UserCreateBase, UserUpdate
from app.api.auth.services.account_security import (
    require_current_password_for_sensitive_update,
    revoke_user_refresh_tokens,
    sensitive_update_fields,
)
from app.api.auth.services.auth_backends import build_authentication_backends
from app.api.auth.services.email import (
    mask_email_for_log,
    send_email_changed_notification,
    send_password_changed_notification,
    send_password_reset_confirmation_email,
    send_post_verification_email,
    send_reset_password_email,
    send_verification_email,
)
from app.api.auth.services.login_hooks import log_successful_login, update_last_login_metadata
from app.api.auth.services.password_hashing import build_password_helper
from app.api.auth.services.password_validator import validate_password as _validate_password
from app.api.auth.services.rate_limiter import LOGIN_RATE_LIMIT, limiter, rate_limit_bucket_key
from app.api.auth.services.user_database import get_user_db
from app.api.common.audit import AuditAction, audit_event
from app.api.common.routers.dependencies import get_external_http_client

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from fastapi_users.authentication import AuthenticationBackend
    from fastapi_users.jwt import SecretType
    from httpx import AsyncClient
    from starlette.requests import Request
    from starlette.responses import Response

    from app.api.auth.services.common_password_checker import CommonPasswordChecker
    from app.api.auth.services.user_database import UserDatabaseAsync
# Set up logging
logger = logging.getLogger(__name__)

# Declare constants
SECRET: SecretStr = auth_settings.auth_token_secret
ACCESS_TOKEN_TTL = auth_settings.access_token_ttl_seconds
RESET_TOKEN_TTL = auth_settings.reset_password_token_ttl_seconds
VERIFICATION_TOKEN_TTL = auth_settings.verification_token_ttl_seconds
RESET_PASSWORD_TOKEN_AUDIENCE = "fastapi-users:reset"  # noqa: S105 # This value is not a secret.
VERIFICATION_TOKEN_AUDIENCE = "fastapi-users:verify"  # noqa: S105 # This value is not a secret.


def _login_identifier_rate_limit_key(identifier: str) -> str:
    """Return a privacy-preserving login rate-limit key for a submitted identifier."""
    return rate_limit_bucket_key("auth:login:account", identifier)


class UserManager(UUIDIDMixin, BaseUserManager[User, UUID4]):
    """User manager class for FastAPI-Users."""

    # We will initialize the user manager with a UserDatabaseAsync instance in the dependency function below
    user_db: UserDatabaseAsync

    def __init__(
        self,
        user_db: UserDatabaseAsync,
        http_client: AsyncClient | None,
        common_password_checker: CommonPasswordChecker | None = None,
    ) -> None:
        super().__init__(user_db, password_helper=build_password_helper())
        self.http_client = http_client
        self.common_password_checker = common_password_checker
        self.skip_breach_check = False
        self.skip_password_validation = False

    # Set up token secrets and lifetimes
    reset_password_token_secret: SecretType = SECRET.get_secret_value()
    reset_password_token_lifetime_seconds = RESET_TOKEN_TTL
    reset_password_token_audience = RESET_PASSWORD_TOKEN_AUDIENCE

    verification_token_secret: SecretType = SECRET.get_secret_value()
    verification_token_lifetime_seconds = VERIFICATION_TOKEN_TTL
    verification_token_audience = VERIFICATION_TOKEN_AUDIENCE

    async def authenticate(self, credentials: OAuth2PasswordRequestForm) -> User | None:
        """Support login with either email or username."""
        limiter.hit_key(LOGIN_RATE_LIMIT, _login_identifier_rate_limit_key(credentials.username))

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
        user: UserCreateBase | User,
    ) -> None:
        """Delegate password validation to the dedicated service."""
        if self.skip_password_validation:
            return
        await _validate_password(
            password,
            email=user.email,
            username=getattr(user, "username", None),
            http_client=self.http_client,
            common_password_checker=self.common_password_checker,
            skip_breach_check=self.skip_breach_check,
        )

    async def update(
        self,
        user_update: schemas.UU,
        user: User,
        safe: bool = False,  # noqa: FBT002, FBT001 # Expected by parent class signature
        request: Request | None = None,
    ) -> User:
        """Update a user, injecting custom username validation first."""
        # Will raise exceptions like UserNameAlreadyExistsError if validation fails
        real_user_update = cast("UserUpdate", user_update)
        sensitive_fields = sensitive_update_fields(real_user_update)
        require_current_password_for_sensitive_update(
            password_helper=self.password_helper,
            user_update=real_user_update,
            user=user,
            sensitive_fields=sensitive_fields,
        )
        real_user_update = await update_user_override(self.user_db, user, real_user_update)
        user_update = cast("schemas.UU", real_user_update)

        old_email = user.email

        # Proceed with base FastAPI User update logic
        updated_user = await super().update(user_update, user, safe=safe, request=request)

        if sensitive_fields:
            await revoke_user_refresh_tokens(updated_user.id, request)

        if real_user_update.email is not None and updated_user.email != old_email:
            await self.request_verify(updated_user, request)
            await send_email_changed_notification(old_email)
        if real_user_update.password is not None:
            await send_password_changed_notification(updated_user.email, updated_user.username)

        return updated_user

    async def on_after_request_verify(self, user: User, token: str, request: Request | None = None) -> None:  # noqa: ARG002 # Request argument is expected in the method signature
        """Send verification email after verification is requested."""
        await send_verification_email(user.email, user.username, token)
        logger.info("Verification email sent to user %s", mask_email_for_log(user.email))

    async def on_after_verify(self, user: User, request: Request | None = None) -> None:  # noqa: ARG002 # Request argument is expected in the method signature
        """Send welcome email after user verifies their email."""
        logger.info("User %s has been verified.", mask_email_for_log(user.email))
        await send_post_verification_email(user.email, user.username)

    async def on_after_forgot_password(
        self,
        user: User,
        token: str,
        request: Request | None = None,
    ) -> None:
        """Send password reset email."""
        logger.info("Password reset email requested for user %s", mask_email_for_log(user.email))
        background_tasks = getattr(getattr(request, "state", None), "background_tasks", None)
        await send_reset_password_email(user.email, user.username, token, background_tasks)

    async def on_after_reset_password(self, user: User, request: Request | None = None) -> None:
        """Revoke active refresh tokens and notify the user after a password reset."""
        await revoke_user_refresh_tokens(user.id, request)
        await send_password_reset_confirmation_email(user.email, user.username)

    async def on_after_update(self, user: User, update_dict: dict, request: Request | None = None) -> None:
        """Revoke all refresh tokens when a user is deactivated."""
        if update_dict.get("is_active") is False:
            await revoke_user_refresh_tokens(user.id, request)
            audit_event(user.id, AuditAction.DEACTIVATE, User, user.id)

    async def on_after_login(
        self,
        user: User,
        request: Request | None = None,
        response: Response | None = None,  # noqa: ARG002 # Response argument is expected in the method signature
    ) -> None:
        """Update last login timestamp after successful authentication."""
        await update_last_login_metadata(user, request, self.user_db.session)
        log_successful_login(user)


async def get_user_manager(
    user_db: UserDatabaseAsync[User, UUID4] = Depends(get_user_db),
    http_client: AsyncClient | None = Depends(get_external_http_client),
    common_password_checker: CommonPasswordChecker | None = Depends(get_common_password_checker),
) -> AsyncGenerator[UserManager]:
    """Async generator for the user manager."""
    # Programmatic callers (seeding/CLI) drive this generator without FastAPI,
    # so the Depends defaults arrive unresolved. Coerce those sentinels to None:
    # validate_password falls back to the local common-password list, and the
    # breach check is skipped when there is no http_client.
    if isinstance(http_client, params.Depends):
        http_client = None
    if isinstance(common_password_checker, params.Depends):
        common_password_checker = None
    yield UserManager(user_db, http_client, common_password_checker)


bearer_auth_backend: AuthenticationBackend[User, UUID4]
cookie_auth_backend: AuthenticationBackend[User, UUID4]
bearer_auth_backend, cookie_auth_backend = build_authentication_backends()

# User manager singleton
fastapi_user_manager = FastAPIUsers[User, UUID4](get_user_manager, [bearer_auth_backend, cookie_auth_backend])
