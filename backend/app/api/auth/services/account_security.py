"""Account-security helpers used by user lifecycle hooks."""

from typing import TYPE_CHECKING

from fastapi import HTTPException, status

from app.api.auth.schemas import UserUpdate
from app.api.auth.services import refresh_token_service
from app.core.runtime import require_connection_redis

if TYPE_CHECKING:
    from fastapi_users.password import PasswordHelper, PasswordHelperProtocol
    from pydantic import UUID4
    from starlette.requests import Request

    from app.api.auth.models import User

SENSITIVE_UPDATE_FIELDS = frozenset({"email", "password"})


def sensitive_update_fields(user_update: UserUpdate) -> set[str]:
    """Return sensitive account fields included in a user update."""
    return set(user_update.model_dump(exclude_unset=True)) & SENSITIVE_UPDATE_FIELDS


def verify_current_password(*, password_helper: PasswordHelperProtocol, password: str, user: User) -> None:
    """Reauthenticate with the account password, raising 401 on mismatch."""
    is_valid, _ = password_helper.verify_and_update(password, user.hashed_password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is invalid.",
        )


def require_current_password_for_sensitive_update(
    *,
    password_helper: PasswordHelper,
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
    password_helper: PasswordHelper,
    user: User,
    current_password: str | None,
    action: str,
) -> None:
    """Require the account password before changing an authentication method.

    Linking or unlinking a social login changes how the account can be signed into, so
    it needs the same re-authentication as an email or password change (ASVS V7.5.1) —
    an active session alone is not enough, or a stolen session can attach a provider the
    attacker controls and keep access after the victim resets their password.

    An OAuth-only account has no usable password to re-assert; the out-of-band
    notification email is the compensating control there.
    """
    if not user.has_usable_password:
        return
    if not current_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Current password is required to {action}.",
        )
    verify_current_password(password_helper=password_helper, password=current_password, user=user)


async def revoke_user_refresh_tokens(user_id: UUID4, request: Request | None) -> None:
    """Revoke every refresh-token session for a user in the current request context."""
    if request is None:
        msg = "Request context is required to revoke refresh-token sessions."
        raise RuntimeError(msg)
    redis = require_connection_redis(request)
    await refresh_token_service.revoke_all_user_tokens(redis, user_id)
