"""User management service."""

import logging
from collections.abc import AsyncGenerator

import tldextract
from fastapi import Depends
from fastapi_users import FastAPIUsers, InvalidPasswordException, UUIDIDMixin
from fastapi_users.authentication import AuthenticationBackend, BearerTransport, CookieTransport, JWTStrategy
from fastapi_users.jwt import SecretType
from fastapi_users.manager import BaseUserManager
from fastapi_users_db_sqlmodel import SQLModelUserDatabaseAsync
from pydantic import UUID4, SecretStr
from starlette.requests import Request

from app.api.auth.config import settings as auth_settings
from app.api.auth.crud import (
    add_user_role_in_organization_after_registration,
    create_user_override,
    update_user_override,
)
from app.api.auth.exceptions import AuthCRUDError
from app.api.auth.models import OAuthAccount, User
from app.api.auth.schemas import UserCreate, UserCreateWithOrganization, UserUpdate
from app.api.auth.utils.programmatic_emails import (
    send_post_verification_email,
    send_registration_email,
    send_reset_password_email,
    send_verification_email,
)
from app.api.common.routers.dependencies import AsyncSessionDep
from app.core.config import settings as core_settings

# Set up logging
logger = logging.getLogger(__name__)

# Declare constants
SECRET: str = auth_settings.fastapi_users_secret
ACCESS_TOKEN_TTL = auth_settings.access_token_ttl_seconds
RESET_TOKEN_TTL = auth_settings.reset_password_token_ttl_seconds
VERIFICATION_TOKEN_TTL = auth_settings.verification_token_ttl_seconds


class UserManager(UUIDIDMixin, BaseUserManager[User, UUID4]):
    """User manager class for FastAPI-Users."""

    # Set up token secrets and lifetimes
    reset_password_token_secret: SecretType = SECRET
    reset_password_token_lifetime_seconds = RESET_TOKEN_TTL

    verification_token_secret: SecretType = SECRET
    verification_token_lifetime_seconds = VERIFICATION_TOKEN_TTL

    async def create(
        self,
        user_create: UserCreate | UserCreateWithOrganization,
        safe: bool = False,  # noqa: FBT001, FBT002 # This boolean-typed positional argument is expected by the `create` function signature
        request: Request | None = None,
    ) -> User:
        """Override of base user creation with additional username uniqueness check and organization creation."""
        try:
            user_create = await create_user_override(self.user_db, user_create)
        # HACK: This is a temporary solution to allow error propagation for username and organization creation errors.
        # The built-in UserManager register route can only catch UserAlreadyExists and InvalidPasswordException errors.
        # TODO: Implement custom exceptions in custom register router, this will also simplify user creation crud.
        except AuthCRUDError as e:
            raise InvalidPasswordException(
                reason="WARNING: This is an AuthCRUDError error, not an InvalidPasswordException. To be fixed. "
                + str(e)
            ) from e
        return await super().create(user_create, safe, request)

    async def update(
        self,
        user_update: UserUpdate,
        user: User,
        safe: bool = False,  # noqa: FBT001, FBT002 # This boolean-typed positional argument is expected by the `create` function signature
        request: Request | None = None,
    ) -> User:
        """Override of base user update with additional username and organization validation."""
        try:
            user_update = await update_user_override(self.user_db, user, user_update)
        # HACK: This is a temporary solution to allow error propagation for username and organization creation errors.
        # The built-in UserManager register route can only catch UserAlreadyExists and InvalidPasswordException errors.
        # TODO: Implement custom exceptions in custom update router, this will also simplify user creation crud.
        except AuthCRUDError as e:
            raise InvalidPasswordException(
                reason="WARNING: This is an AuthCRUDError error, not an InvalidPasswordException. To be fixed. "
                + str(e)
            ) from e

        return await super().update(user_update, user, safe, request)

    async def validate_password(  # pyright: ignore [reportIncompatibleMethodOverride] # Allow overriding user type in method
        self,
        password: str | SecretStr,
        user: UserCreate | User,
    ) -> None:
        if isinstance(password, SecretStr):
            password = password.get_secret_value()
        if len(password) < 8:
            raise InvalidPasswordException(reason="Password should be at least 8 characters")
        if user.email in password:
            raise InvalidPasswordException(reason="Password should not contain e-mail")
        if user.username and user.username in password:
            raise InvalidPasswordException(reason="Password should not contain username")

    async def on_after_register(self, user: User, request: Request | None = None) -> None:
        if not request:
            err_msg = "Request object is required for user registration"
            raise RuntimeError(err_msg)

        user = await add_user_role_in_organization_after_registration(self.user_db, user, request)

        # HACK: Skip sending registration email for programmatically created users by using synthetic request state
        if request and hasattr(request.state, "send_registration_email") and not request.state.send_registration_email:
            logger.info("Skipping registration email for user %s", user.email)
            return

        # HACK: Create synthetic request to specify sending registration email with verification token
        # instead of normal verification email
        request = Request(scope={"type": "http"})
        request.state.send_registration_email = True
        await self.request_verify(user, request)

    async def on_after_request_verify(
        self, user: User, token: str, request: Request | None = None
    ) -> None:  # Request argument is expected in the method signature
        if request and hasattr(request.state, "send_registration_email") and request.state.send_registration_email:
            # Send registration email with verification token if synthetic request state is set
            await send_registration_email(user.email, user.username, token)
            logger.info("Registration email sent to user %s", user.email)
        else:
            await send_verification_email(user.email, user.username, token)
            logger.info("Verification email sent to user %s", user.email)

    async def on_after_verify(self, user: User, request: Request | None = None) -> None:  # noqa: ARG002 # Request argument is expected in the method signature
        logger.info("User %s has been verified.", user.email)
        await send_post_verification_email(user.email, user.username)

    async def on_after_forgot_password(self, user: User, token: str, request: Request | None = None) -> None:  # noqa: ARG002 # Request argument is expected in the method signature
        logger.info("User %s has forgot their password. Sending reset token", user.email)
        await send_reset_password_email(user.email, user.username, token)


async def get_user_db(session: AsyncSessionDep) -> AsyncGenerator[SQLModelUserDatabaseAsync]:
    """Async generator for the user database."""
    yield SQLModelUserDatabaseAsync(session, User, OAuthAccount)


async def get_user_manager(user_db: SQLModelUserDatabaseAsync = Depends(get_user_db)) -> AsyncGenerator[UserManager]:
    """Async generator for the user manager."""
    yield UserManager(user_db)


# Bearer Transport
bearer_transport = BearerTransport(tokenUrl="auth/bearer/login")


# Cookie Transport

# Set the cookie domain to the main host, including subdomains (hence the dot prefix)
url_extract = tldextract.extract(str(core_settings.frontend_web_url))
cookie_domain = f".{url_extract.domain}.{url_extract.suffix}" if url_extract.domain and url_extract.suffix else None

cookie_transport = CookieTransport(
    cookie_name="auth",
    cookie_max_age=ACCESS_TOKEN_TTL,
    cookie_domain=cookie_domain,
)


def get_jwt_strategy() -> JWTStrategy:
    """Get a JWT strategy to be used in authentication backends."""
    return JWTStrategy(secret=SECRET, lifetime_seconds=ACCESS_TOKEN_TTL)


# Authentication backends
bearer_auth_backend = AuthenticationBackend(name="bearer", transport=bearer_transport, get_strategy=get_jwt_strategy)
cookie_auth_backend = AuthenticationBackend(name="cookie", transport=cookie_transport, get_strategy=get_jwt_strategy)

# User manager singleton
fastapi_user_manager = FastAPIUsers[User, UUID4](get_user_manager, [bearer_auth_backend, cookie_auth_backend])
