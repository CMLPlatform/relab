"""Account-security helpers used by user lifecycle hooks."""

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from fastapi import HTTPException, status

from app.api.auth.exceptions import RecentSignInRequiredError
from app.api.auth.models import User
from app.api.auth.schemas import UserUpdate
from app.api.auth.services import refresh_token_service
from app.api.common.audit import AuditAction, AuditContext, audit_event
from app.core.runtime import require_connection_redis

if TYPE_CHECKING:
    from fastapi_users.password import PasswordHelperProtocol
    from pydantic import UUID4
    from starlette.requests import Request

SENSITIVE_UPDATE_FIELDS = frozenset({"email", "password"})
# How recent a sign-in must be when the account has no other factor to re-enter.
RECENT_SIGN_IN_WINDOW = timedelta(minutes=10)


def sensitive_update_fields(user_update: UserUpdate) -> set[str]:
    """Return sensitive account fields included in a user update."""
    return set(user_update.model_dump(exclude_unset=True)) & SENSITIVE_UPDATE_FIELDS


def verify_current_password(*, password_helper: PasswordHelperProtocol, password: str, user: User) -> None:
    """Reauthenticate with the account password, raising 403 on mismatch.

    403, not 401: the session is valid, so clients must not treat this as an expired
    access token and refresh-and-retry (which would spend a second password guess).
    """
    is_valid, _ = password_helper.verify_and_update(password, user.hashed_password)
    if not is_valid:
        audit_event(
            user.id,
            AuditAction.LOGIN_FAILURE,
            User,
            user.id,
            context=AuditContext(outcome="denied", flow="step_up", reason="invalid_current_password"),
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Current password is invalid.",
        )


def require_current_password_for_sensitive_update(
    *,
    password_helper: PasswordHelperProtocol,
    user_update: UserUpdate,
    user: User,
    sensitive_fields: set[str],
) -> None:
    """Require password reauthentication before e-mail or password changes."""
    if not sensitive_fields:
        return

    if not user_update.current_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is required for this account update.",
        )

    verify_current_password(
        password_helper=password_helper,
        password=user_update.current_password.get_secret_value(),
        user=user,
    )


def require_step_up_password(
    *,
    password_helper: PasswordHelperProtocol,
    user: User,
    current_password: str | None,
    action: str,
) -> None:
    """Require the account password before changing an authentication method.

    Linking or unlinking a social login changes how the account can be signed into, so
    it needs the same re-authentication as an email or password change (ASVS V7.5.1);
    an active session alone is not enough, or a stolen session can attach a provider the
    attacker controls and keep access after the victim resets their password.

    An OAuth-only account has no usable password to re-assert; callers pair this with
    ``require_recent_sign_in``, and the out-of-band notification email backs that up.
    """
    if not user.has_usable_password:
        return
    if not current_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Current password is required to {action}.",
        )
    verify_current_password(password_helper=password_helper, password=current_password, user=user)


def require_recent_sign_in(user: User) -> None:
    """Require a fresh sign-in when the account has no password and no MFA to re-enter.

    For such an account the session is the only proof of identity, so a stolen session
    could otherwise act alone. ``last_login_at`` moves on every completed sign-in
    (password, MFA challenge, or OAuth callback) but not on a token refresh, so it
    dates the last time the owner proved who they are.
    """
    if user.has_usable_password or user.mfa_enabled:
        return
    if user.last_login_at is None or datetime.now(UTC) - user.last_login_at > RECENT_SIGN_IN_WINDOW:
        raise RecentSignInRequiredError


async def revoke_user_refresh_tokens(user_id: UUID4, request: Request | None) -> None:
    """Revoke every refresh-token session for a user in the current request context."""
    if request is None:
        msg = "Request context is required to revoke refresh-token sessions."
        raise RuntimeError(msg)
    redis = require_connection_redis(request)
    await refresh_token_service.revoke_all_user_tokens(redis, user_id)
