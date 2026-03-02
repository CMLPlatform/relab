"""User management service."""

import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING

import tldextract
from fastapi import Depends
from fastapi_users import FastAPIUsers, InvalidPasswordException, UUIDIDMixin
from fastapi_users.authentication import AuthenticationBackend, BearerTransport, CookieTransport, RedisStrategy
from fastapi_users.manager import BaseUserManager
from fastapi_users_db_sqlmodel import SQLModelUserDatabaseAsync
from pydantic import UUID4, SecretStr

from app.api.auth.config import settings as auth_settings
from app.api.auth.models import OAuthAccount, User
from app.api.auth.schemas import UserCreate
from app.api.auth.services import refresh_token_service, session_service
from app.api.auth.utils.programmatic_emails import (
    send_post_verification_email,
    send_reset_password_email,
    send_verification_email,
)
from app.api.common.routers.dependencies import AsyncSessionDep
from app.core.config import settings as core_settings
from app.core.redis import RedisDep

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from fastapi_users.jwt import SecretType
    from starlette.requests import Request
    from starlette.responses import Response

# Set up logging
logger = logging.getLogger(__name__)

# Declare constants
SECRET: SecretStr = auth_settings.fastapi_users_secret
ACCESS_TOKEN_TTL = auth_settings.access_token_ttl_seconds
RESET_TOKEN_TTL = auth_settings.reset_password_token_ttl_seconds
VERIFICATION_TOKEN_TTL = auth_settings.verification_token_ttl_seconds


class UserManager(UUIDIDMixin, BaseUserManager[User, UUID4]):  # spellchecker: ignore UUIDID
    """User manager class for FastAPI-Users."""

    # We will initialize the user manager with a SQLModelUserDatabaseAsync instance in the dependency function below
    user_db: SQLModelUserDatabaseAsync

    # Set up token secrets and lifetimes
    reset_password_token_secret: SecretType = SECRET.get_secret_value()
    reset_password_token_lifetime_seconds = RESET_TOKEN_TTL

    verification_token_secret: SecretType = SECRET.get_secret_value()
    verification_token_lifetime_seconds = VERIFICATION_TOKEN_TTL

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

    async def on_after_request_verify(self, user: User, token: str, request: Request | None = None) -> None:  # noqa: ARG002 # Request argument is expected in the method signature
        """Send verification email after verification is requested."""
        await send_verification_email(user.email, user.username, token)
        logger.info("Verification email sent to user %s", user.email)

    async def on_after_verify(self, user: User, request: Request | None = None) -> None:  # noqa: ARG002 # Request argument is expected in the method signature
        """Send welcome email after user verifies their email."""
        logger.info("User %s has been verified.", user.email)
        await send_post_verification_email(user.email, user.username)

    async def on_after_forgot_password(self, user: User, token: str, request: Request | None = None) -> None:  # noqa: ARG002 # Request argument is expected in the method signature
        """Send password reset email."""
        logger.info("User %s has forgot their password. Sending reset token", user.email)
        await send_reset_password_email(user.email, user.username, token)

    async def on_after_login(
        self, user: User, request: Request | None = None, response: Response | None = None
    ) -> None:
        """Update last login timestamp, create refresh token and session after successful authentication."""
        # Update last login info
        user.last_login_at = datetime.now(UTC).replace(tzinfo=None)
        if request and request.client:
            user.last_login_ip = request.client.host
        await self.user_db.session.commit()

        # Create refresh token and session if Redis is available
        if request and hasattr(request.app.state, "redis") and request.app.state.redis:
            redis = request.app.state.redis
            device_info = request.headers.get("User-Agent", "Unknown")
            ip_address = request.client.host if request.client else "unknown"

            # Create refresh token
            refresh_token = await refresh_token_service.create_refresh_token(
                redis,
                user.id,
                "",  # Session ID will be set after session creation
            )

            # Create session
            await session_service.create_session(redis, user.id, device_info, refresh_token, ip_address)

            # Set refresh token cookie if response available
            if response:
                response.set_cookie(
                    key="refresh_token",
                    value=refresh_token,
                    max_age=auth_settings.refresh_token_expire_days * 86_400,
                    httponly=True,
                    secure=core_settings.secure_cookies,
                    samesite="lax",
                )

        logger.info("User %s logged in from %s", user.email, user.last_login_ip)


async def get_user_db(session: AsyncSessionDep) -> AsyncGenerator[SQLModelUserDatabaseAsync[User, UUID4]]:
    """Async generator for the user database."""
    yield SQLModelUserDatabaseAsync(session, User, OAuthAccount)


async def get_user_manager(
    user_db: SQLModelUserDatabaseAsync[User, UUID4] = Depends(get_user_db),
) -> AsyncGenerator[UserManager]:
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
    cookie_secure=core_settings.secure_cookies,
)


def get_redis_strategy(redis: RedisDep) -> RedisStrategy:
    """Get a Redis strategy for token storage with server-side invalidation."""
    return RedisStrategy(redis, lifetime_seconds=ACCESS_TOKEN_TTL)


# Authentication backends with Redis strategy
bearer_auth_backend = AuthenticationBackend(name="bearer", transport=bearer_transport, get_strategy=get_redis_strategy)
cookie_auth_backend = AuthenticationBackend(name="cookie", transport=cookie_transport, get_strategy=get_redis_strategy)

# User manager singleton
fastapi_user_manager = FastAPIUsers[User, UUID4](get_user_manager, [bearer_auth_backend, cookie_auth_backend])
