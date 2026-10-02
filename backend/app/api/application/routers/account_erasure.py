"""The account-erasure routes: admin deletion by ID, and self-service deletion.

The admin route shares `/admin/users` with `auth.routers.admin_users`, and the
self-service route shares `/users/me` with `auth.routers.users`, rather than living
beside them: erasing an account reaches into products, media and cameras, so both
belong in the application layer.
"""

import logging
from typing import Annotated

from fastapi import BackgroundTasks, Body, Query, Request, Response, Security, status

from app.api.application.account_erasure import ANONYMIZE, ErasureContent, erase_user, require_erasable_account
from app.api.auth.dependencies import (
    CurrentActiveSuperUserDep,
    CurrentActiveUserDep,
    UserByIDDep,
    UserManagerDep,
    current_active_superuser,
)
from app.api.auth.models import User
from app.api.auth.schemas import StepUpRequest
from app.api.auth.services.account_security import revoke_user_refresh_tokens
from app.api.auth.services.auth_backends import clear_auth_cookies
from app.api.auth.services.email.service import send_account_deleted_notification
from app.api.auth.services.mfa_flow import require_step_up
from app.api.auth.services.rate_limiter import LOGIN_IP_RATE_LIMIT
from app.api.auth.services.session_flow import SESSION_LOGOUT_CLEAR_SITE_DATA
from app.api.common.audiences import AdminAPIRouter, PublicAPIRouter
from app.api.common.audit import AuditAction, AuditContext, audit_event
from app.api.common.rate_limiting import limiter
from app.api.common.routers.dependencies import AsyncSessionDep
from app.core.redis import RedisDep

logger = logging.getLogger(__name__)

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
    payload: Annotated[StepUpRequest | None, Body()] = None,
) -> None:
    """Delete the signed-in account, keeping its products under the anonymous system account.

    Personal data is erased; contributed products and media stay on the platform without
    the owner's name. Requires the current password, the same step-up as an email or
    password change, and a current MFA code when the account has MFA enabled. An account
    with neither must have signed in within the last few minutes. The former address gets
    a notification email.
    """
    payload = payload or StepUpRequest()
    current_password = payload.current_password.get_secret_value() if payload.current_password else None
    # Before the step-up, so a refused deletion does not spend the TOTP code.
    await require_erasable_account(session, user)
    await require_step_up(
        user,
        user_manager=user_manager,
        redis=redis,
        current_password=current_password,
        mfa_code=payload.mfa_code,
        action="delete your account",
        # The account, codes included, is erased next.
        burn_recovery_code=False,
    )

    # Read before the erase: the row, and so these attributes, are gone after the commit.
    user_id, email, username = user.id, user.email, user.username
    await erase_user(session, user, actor_id=user_id, content=ANONYMIZE)
    audit_event(
        user_id, AuditAction.DELETE, User, user_id, context=AuditContext(operation=f"erase_{ANONYMIZE}", flow="self")
    )
    # NOTE: revoked after the committed erase, unlike the admin route, so a failed erase
    # never signs the user out for nothing. A Redis failure here still leaves no live
    # session: refresh and access tokens both resolve the user, which no longer exists,
    # so a failure is logged and the notification and cookie clearing still go out.
    try:
        await revoke_user_refresh_tokens(user_id, request)
    except Exception:
        logger.exception("Could not revoke refresh tokens after a self-service account deletion")
    await send_account_deleted_notification(email, username, background_tasks=background_tasks)
    clear_auth_cookies(response)
    response.headers["Clear-Site-Data"] = SESSION_LOGOUT_CLEAR_SITE_DATA
