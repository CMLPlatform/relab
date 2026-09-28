"""The account-erasure routes: admin deletion by ID, and self-service deletion.

The admin route shares `/admin/users` with `auth.routers.admin_users`, and the
self-service route shares `/users/me` with `auth.routers.users`, rather than living
beside them: erasing an account reaches into products, media and cameras, so both
belong in the application layer.
"""

from typing import Annotated

from fastapi import BackgroundTasks, Body, HTTPException, Query, Request, Response, Security, status
from pydantic import BaseModel, ConfigDict, Field, SecretStr

from app.api.application.account_erasure import ANONYMIZE, ErasureContent, erase_user, require_erasable_account
from app.api.auth.dependencies import (
    CurrentActiveSuperUserDep,
    CurrentActiveUserDep,
    UserByIDDep,
    UserManagerDep,
    current_active_superuser,
)
from app.api.auth.exceptions import MfaStepUpCodeInvalidError
from app.api.auth.models import User
from app.api.auth.services.account_security import (
    require_recent_sign_in,
    require_step_up_password,
    revoke_user_refresh_tokens,
)
from app.api.auth.services.auth_backends import clear_auth_cookies
from app.api.auth.services.email.service import send_account_deleted_notification
from app.api.auth.services.mfa_flow import require_mfa_step_up
from app.api.auth.services.rate_limiter import LOGIN_IP_RATE_LIMIT, LOGIN_RATE_LIMIT
from app.api.auth.services.session_flow import SESSION_LOGOUT_CLEAR_SITE_DATA
from app.api.common.audiences import AdminAPIRouter, PublicAPIRouter
from app.api.common.audit import AuditAction, AuditContext, audit_event
from app.api.common.rate_limiting import limiter, rate_limit_bucket_key
from app.api.common.routers.dependencies import AsyncSessionDep
from app.core.redis import RedisDep

router = AdminAPIRouter(prefix="/admin/users", tags=["admin"], dependencies=[Security(current_active_superuser)])
# Rate-limited like login: per IP here, and per account on failed step-ups in the route.
self_service_router = PublicAPIRouter(
    prefix="/users", tags=["users"], dependencies=[limiter.dependency(LOGIN_IP_RATE_LIMIT, name="login_ip_rate_limit")]
)


@router.delete(
    "/{user_id}",  # user_id is bound by the get_user_or_404 dependency
    summary="Delete a user by ID",
    status_code=204,
)
async def delete_user(
    user: UserByIDDep,
    actor: CurrentActiveSuperUserDep,
    session: AsyncSessionDep,
    request: Request,
    content: Annotated[
        ErasureContent,
        Query(
            description=(
                "What to do with the research data this user contributed: `anonymize` "
                "reassigns their products to the anonymous system account, `delete` "
                "removes the products and their media. Personal data is erased either way."
            )
        ),
    ] = ANONYMIZE,
) -> None:
    """Delete a user by ID, anonymizing or deleting the content they own."""
    # Guard first so a refused erasure has no side effects; revoke before erasing so a
    # Redis failure aborts rather than leaving a deleted user with live sessions.
    await require_erasable_account(session, user)
    await revoke_user_refresh_tokens(user.id, request)
    await erase_user(session, user, actor_id=actor.id, content=content)
    audit_event(actor.id, AuditAction.DELETE, User, user.id, context=AuditContext(operation=f"erase_{content}"))


class AccountDeletionRequest(BaseModel):
    """Step-up body for deleting your own account."""

    model_config = ConfigDict(extra="forbid")

    current_password: SecretStr | None = Field(
        default=None,
        description=(
            "Current account password, to reauthenticate the deletion. "
            "Required unless the account has no usable password (OAuth-only)."
        ),
    )
    # 6 digits for TOTP, or a longer recovery code (grouped, e.g. "ABCDE-FGHIJ").
    mfa_code: str | None = Field(
        default=None,
        min_length=6,
        max_length=20,
        description="Current authenticator code or a recovery code. Required when the account has MFA enabled.",
    )


@self_service_router.delete(
    "/me",
    summary="Delete your own account",
    status_code=204,
    responses={
        status.HTTP_400_BAD_REQUEST: {"description": "The current password or MFA code is missing."},
        status.HTTP_403_FORBIDDEN: {
            "description": "The current password or MFA code is invalid, or the account needs a fresh sign-in."
        },
        status.HTTP_409_CONFLICT: {"description": "This account cannot be deleted (the last active superuser)."},
    },
)
async def delete_own_account(
    user: CurrentActiveUserDep,
    user_manager: UserManagerDep,
    session: AsyncSessionDep,
    redis: RedisDep,
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
    payload: Annotated[AccountDeletionRequest | None, Body()] = None,
) -> None:
    """Delete the signed-in account, keeping its products under the anonymous system account.

    Personal data is erased; contributed products and media stay on the platform without
    the owner's name. Requires the current password, the same step-up as an email or
    password change, and a current MFA code when the account has MFA enabled. An account
    with neither must have signed in within the last few minutes. The former address gets
    a notification email.
    """
    # Only failed guesses count, like the per-account failed-login budget.
    step_up_key = rate_limit_bucket_key("auth:step-up:account", str(user.id))
    await limiter.ahit_key(LOGIN_RATE_LIMIT, step_up_key, consume=False)

    payload = payload or AccountDeletionRequest()
    current_password = payload.current_password.get_secret_value() if payload.current_password else None
    try:
        require_step_up_password(
            password_helper=user_manager.password_helper,
            user=user,
            current_password=current_password,
            action="delete your account",
        )
    except HTTPException as exc:
        if exc.status_code == status.HTTP_403_FORBIDDEN:
            await limiter.ahit_key(LOGIN_RATE_LIMIT, step_up_key)
        raise
    require_recent_sign_in(user)
    # Before the MFA step-up, so a refused deletion does not spend the TOTP code.
    await require_erasable_account(session, user)
    try:
        await require_mfa_step_up(payload.mfa_code, user=user, redis=redis, action="delete your account")
    except MfaStepUpCodeInvalidError:
        await limiter.ahit_key(LOGIN_RATE_LIMIT, step_up_key)
        raise

    # Read before the erase: the row, and so these attributes, are gone after the commit.
    user_id, email, username = user.id, user.email, user.username
    await erase_user(session, user, actor_id=user_id, content=ANONYMIZE)
    audit_event(
        user_id, AuditAction.DELETE, User, user_id, context=AuditContext(operation=f"erase_{ANONYMIZE}", flow="self")
    )
    # NOTE: revoked after the committed erase, unlike the admin route, so a failed erase
    # never signs the user out for nothing. A Redis failure here still leaves no live
    # session: refresh and access tokens both resolve the user, which no longer exists.
    await revoke_user_refresh_tokens(user_id, request)
    await send_account_deleted_notification(email, username, background_tasks=background_tasks)
    clear_auth_cookies(response)
    response.headers["Clear-Site-Data"] = SESSION_LOGOUT_CLEAR_SITE_DATA
