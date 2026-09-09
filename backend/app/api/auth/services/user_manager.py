"""User management service."""

import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Annotated, cast

from anyio import to_thread
from fastapi import Depends, params
from fastapi.security import OAuth2PasswordRequestForm
from fastapi_users import FastAPIUsers, UUIDIDMixin, exceptions, schemas
from fastapi_users.manager import BaseUserManager
from pydantic import UUID4, EmailStr, SecretStr, TypeAdapter, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.config import settings as auth_settings
from app.api.auth.crud import update_user_override
from app.api.auth.models import OAuthAccount, User
from app.api.auth.runtime_dependencies import get_common_password_checker
from app.api.auth.schemas import UserCreateBase, UserUpdate
from app.api.auth.services.account_security import (
    require_current_password_for_sensitive_update,
    revoke_user_refresh_tokens,
    sensitive_update_fields,
)
from app.api.auth.services.auth_backends import build_authentication_backends
from app.api.auth.services.email.service import (
    mask_email_for_log,
    send_email_changed_notification,
    send_oauth_welcome_notification,
    send_password_changed_notification,
    send_password_reset_confirmation_email,
    send_post_verification_email,
    send_reset_password_email,
    send_verification_email,
)
from app.api.auth.services.password_hashing import build_password_helper
from app.api.auth.services.password_validator import validate_password as _validate_password
from app.api.auth.services.rate_limiter import LOGIN_RATE_LIMIT
from app.api.auth.services.user_database import UserDatabaseAsync
from app.api.auth.terms import CURRENT_TERMS_VERSION
from app.api.common.audit import AuditAction, audit_event
from app.api.common.rate_limiting import limiter, rate_limit_bucket_key
from app.api.common.routers.dependencies import background_tasks_from, get_external_http_client

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from fastapi_users.authentication import AuthenticationBackend
    from fastapi_users.jwt import SecretType
    from httpx import AsyncClient
    from starlette.requests import Request
    from starlette.responses import Response

    from app.api.auth.services.common_password_checker import CommonPasswordChecker

logger = logging.getLogger(__name__)

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

    reset_password_token_secret: SecretType = SECRET.get_secret_value()
    reset_password_token_lifetime_seconds = RESET_TOKEN_TTL
    reset_password_token_audience = RESET_PASSWORD_TOKEN_AUDIENCE

    verification_token_secret: SecretType = SECRET.get_secret_value()
    verification_token_lifetime_seconds = VERIFICATION_TOKEN_TTL
    verification_token_audience = VERIFICATION_TOKEN_AUDIENCE

    async def authenticate(self, credentials: OAuth2PasswordRequestForm) -> User | None:
        """Support login with either email or username."""
        is_email = False
        try:
            TypeAdapter(EmailStr).validate_python(credentials.username)
            is_email = True
        except ValidationError:
            # Not an email address, so fall through to the username lookup below.
            pass

        if not is_email:
            statement = select(User).where(User.username == credentials.username)
            result = await self.user_db.session.execute(statement)
            db_user = result.scalars().unique().one_or_none()
            if db_user:
                credentials.username = db_user.email

        # Rate-limit on the resolved email so a username and its email share one bucket.
        await limiter.ahit_key(LOGIN_RATE_LIMIT, _login_identifier_rate_limit_key(credentials.username))
        return await self._authenticate_offloading_hashes(credentials)

    async def _authenticate_offloading_hashes(self, credentials: OAuth2PasswordRequestForm) -> User | None:
        """Run the upstream authenticate flow with the Argon2 work off the event loop.

        Argon2id at the parameters in ``password_hashing`` costs 50-100ms of CPU,
        and ``BaseUserManager.authenticate`` calls the hasher inline from its own
        coroutine. On a single worker that blocks the event loop for every request
        in flight, not just the login: a concurrent login stage measurably inflated
        the tail of every other endpoint in the perf baseline.

        Reimplemented rather than delegated because the blocking calls sit in the
        middle of the upstream coroutine, with no seam to wrap. The behaviours that
        reimplementation has to preserve — the timing-attack hash for an unknown
        account, rejecting a wrong password, and the opportunistic hash upgrade —
        are pinned by tests so an upstream change cannot drift past unnoticed.
        """
        try:
            user = await self.get_by_email(credentials.username)
        except exceptions.UserNotExists:
            # Hash anyway, so a missing account costs the same as a wrong password.
            await to_thread.run_sync(self.password_helper.hash, credentials.password)
            return None

        verified, updated_password_hash = await to_thread.run_sync(
            self.password_helper.verify_and_update, credentials.password, user.hashed_password
        )
        if not verified:
            return None
        if updated_password_hash is not None:
            await self.user_db.update(user, {"hashed_password": updated_password_hash})
        return user

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
        real_user_update = cast("UserUpdate", user_update)
        sensitive_fields = sensitive_update_fields(real_user_update)
        # Only the self-service path (safe=True) can re-authenticate; an admin does not
        # know the target's password.
        if safe:
            require_current_password_for_sensitive_update(
                password_helper=self.password_helper,
                user_update=real_user_update,
                user=user,
                sensitive_fields=sensitive_fields,
            )
        real_user_update = await update_user_override(self.user_db, user, real_user_update)
        user_update = cast("schemas.UU", real_user_update)

        old_email = user.email
        deferred = background_tasks_from(request)

        updated_user = await super().update(user_update, user, safe=safe, request=request)

        if sensitive_fields:
            await revoke_user_refresh_tokens(updated_user.id, request)

        if real_user_update.email is not None and updated_user.email != old_email:
            await self.request_verify(updated_user, request)
            await send_email_changed_notification(old_email, deferred)
        if real_user_update.password is not None:
            await send_password_changed_notification(updated_user.email, updated_user.username, deferred)

        return updated_user

    async def on_after_register(self, user: User, request: Request | None = None) -> None:
        """Record terms acceptance, and welcome social-login signups.

        Password signups get their welcome through the verification flow; OAuth accounts are
        provider-verified and never request verification, so they are welcomed here.
        """
        # Both signup screens link the terms, so creating the account is the acceptance.
        # Programmatic creation (seeding, CLI) has no signup screen, so it stays NULL.
        if request is not None:
            user.terms_accepted_version = CURRENT_TERMS_VERSION
            user.terms_accepted_at = datetime.now(UTC)
        # OAuth-created accounts get a random password they can never use.
        if user.oauth_accounts and user.has_usable_password:
            user.has_usable_password = False
        await self.user_db.session.commit()

        if not user.oauth_accounts:
            return
        await send_oauth_welcome_notification(
            user.email,
            user.username,
            oauth_provider=user.oauth_accounts[0].oauth_name,
            background_tasks=background_tasks_from(request),
        )
        logger.info("OAuth welcome email sent to user %s", mask_email_for_log(user.email))

    async def on_after_request_verify(self, user: User, token: str, request: Request | None = None) -> None:
        """Send verification email after verification is requested."""
        await send_verification_email(user.email, user.username, token, background_tasks_from(request))
        logger.info("Verification email sent to user %s", mask_email_for_log(user.email))

    async def on_after_verify(self, user: User, request: Request | None = None) -> None:
        """Send welcome email after user verifies their email."""
        logger.info("User %s has been verified.", mask_email_for_log(user.email))
        await send_post_verification_email(user.email, user.username, background_tasks_from(request))

    async def on_after_forgot_password(
        self,
        user: User,
        token: str,
        request: Request | None = None,
    ) -> None:
        """Send password reset email."""
        logger.info("Password reset email requested for user %s", mask_email_for_log(user.email))
        await send_reset_password_email(user.email, user.username, token, background_tasks_from(request))

    async def on_after_reset_password(self, user: User, request: Request | None = None) -> None:
        """Revoke active refresh tokens and notify the user after a password reset."""
        # A reset is how an OAuth-only account first gains a usable password.
        if not user.has_usable_password:
            user.has_usable_password = True
            await self.user_db.session.commit()
        await revoke_user_refresh_tokens(user.id, request)
        await send_password_reset_confirmation_email(user.email, user.username, background_tasks_from(request))

    async def on_after_update(self, user: User, update_dict: dict, request: Request | None = None) -> None:
        """Revoke all refresh tokens when a user is deactivated."""
        if update_dict.get("is_active") is False:
            await revoke_user_refresh_tokens(user.id, request)
            audit_event(user.id, AuditAction.DEACTIVATE, User, user.id)

    async def on_before_delete(self, user: User, request: Request | None = None) -> None:
        """Revoke all refresh tokens before a user is hard-deleted.

        Before, not after: the after-hook runs once the row is gone, so a Redis outage there
        would leave a deleted user with live sessions. Raising here aborts the delete.

        The admin route emits the deletion audit, where the acting superuser is known.
        """
        await revoke_user_refresh_tokens(user.id, request)

    async def on_after_login(
        self,
        user: User,
        request: Request | None = None,  # noqa: ARG002 # part of the fastapi-users on_after_login signature
        response: Response | None = None,  # noqa: ARG002 # Response argument is expected in the method signature
    ) -> None:
        """Persist the login timestamp and log the event after successful authentication."""
        user.last_login_at = datetime.now(UTC)
        await self.user_db.session.commit()
        logger.info("User %s logged in", mask_email_for_log(user.email))


async def get_auth_async_session() -> AsyncGenerator[AsyncSession]:
    """Yield the shared async database session for auth request dependencies."""
    from app.core.database import get_async_session  # noqa: PLC0415

    async for session in get_async_session():
        yield session


async def get_user_db(
    session: Annotated[AsyncSession, Depends(get_auth_async_session)],
) -> AsyncGenerator[UserDatabaseAsync[User, UUID4]]:
    """Build the FastAPI Users database adapter from the shared DB session."""
    yield UserDatabaseAsync(session, User, OAuthAccount)


async def get_user_manager(
    user_db: UserDatabaseAsync[User, UUID4] = Depends(get_user_db),
    http_client: AsyncClient | None = Depends(get_external_http_client),
    common_password_checker: CommonPasswordChecker | None = Depends(get_common_password_checker),
) -> AsyncGenerator[UserManager]:
    """Async generator for the user manager."""
    # Programmatic callers (seeding/CLI) leave the Depends defaults unresolved; coerce to
    # None so validate_password uses the local list and skips the breach check.
    if isinstance(http_client, params.Depends):
        http_client = None
    if isinstance(common_password_checker, params.Depends):
        common_password_checker = None
    yield UserManager(user_db, http_client, common_password_checker)


bearer_auth_backend: AuthenticationBackend[User, UUID4]
cookie_auth_backend: AuthenticationBackend[User, UUID4]
bearer_auth_backend, cookie_auth_backend = build_authentication_backends()

fastapi_user_manager = FastAPIUsers[User, UUID4](get_user_manager, [bearer_auth_backend, cookie_auth_backend])
