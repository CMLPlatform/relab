"""The account-erasure routes: admin deletion by ID, and self-service deletion.

The admin route shares `/admin/users` with `auth.routers.admin_users`, and the
self-service route shares `/users/me` with `auth.routers.users`, rather than living
beside them: erasing an account reaches into products, media and cameras, so both
belong in the application layer.
"""

from typing import Annotated

from fastapi import Body, Query, Request, Response, Security
from pydantic import BaseModel, ConfigDict, Field, SecretStr

from app.api.application.account_erasure import ANONYMIZE, ErasureContent, erase_user, require_erasable_account
from app.api.auth.dependencies import (
    CurrentActiveSuperUserDep,
    CurrentActiveUserDep,
    UserByIDDep,
    UserManagerDep,
    current_active_superuser,
)
from app.api.auth.models import User
from app.api.auth.services.account_security import require_step_up_password, revoke_user_refresh_tokens
from app.api.auth.services.auth_backends import clear_auth_cookies
from app.api.auth.services.mfa_flow import require_mfa_step_up
from app.api.auth.services.rate_limiter import LOGIN_RATE_LIMIT
from app.api.auth.services.session_flow import SESSION_LOGOUT_CLEAR_SITE_DATA
from app.api.common.audiences import AdminAPIRouter, PublicAPIRouter
from app.api.common.audit import AuditAction, AuditContext, audit_event
from app.api.common.rate_limiting import limiter
from app.api.common.routers.dependencies import AsyncSessionDep
from app.core.redis import RedisDep

router = AdminAPIRouter(prefix="/admin/users", tags=["admin"], dependencies=[Security(current_active_superuser)])
# Rate-limited like login: the body carries a password guess.
self_service_router = PublicAPIRouter(
    prefix="/users", tags=["users"], dependencies=[limiter.dependency(LOGIN_RATE_LIMIT)]
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


@self_service_router.delete("/me", summary="Delete your own account", status_code=204)
async def delete_own_account(
    user: CurrentActiveUserDep,
    user_manager: UserManagerDep,
    session: AsyncSessionDep,
    redis: RedisDep,
    request: Request,
    response: Response,
    payload: Annotated[AccountDeletionRequest | None, Body()] = None,
) -> None:
    """Delete the signed-in account, keeping its products under the anonymous system account.

    Personal data is erased; contributed products and media stay on the platform without
    the owner's name. Requires the current password, the same step-up as an email or
    password change, and a current MFA code when the account has MFA enabled.
    """
    current_password = payload.current_password.get_secret_value() if payload and payload.current_password else None
    require_step_up_password(
        password_helper=user_manager.password_helper,
        user=user,
        current_password=current_password,
        action="delete your account",
    )
    await require_mfa_step_up(
        payload.mfa_code if payload else None, user=user, redis=redis, action="delete your account"
    )
    user_id = user.id
    # Same order as the admin route: guard, revoke, erase.
    await require_erasable_account(session, user)
    await revoke_user_refresh_tokens(user_id, request)
    await erase_user(session, user, actor_id=user_id, content=ANONYMIZE)
    audit_event(
        user_id, AuditAction.DELETE, User, user_id, context=AuditContext(operation=f"erase_{ANONYMIZE}", flow="self")
    )
    clear_auth_cookies(response)
    response.headers["Clear-Site-Data"] = SESSION_LOGOUT_CLEAR_SITE_DATA
