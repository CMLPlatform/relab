"""Admin routes for managing users."""

from typing import Annotated, cast

from fastapi import APIRouter, Depends, Request, Security
from fastapi_pagination import Page

from app.api.auth.dependencies import (
    CurrentActiveSuperUserDep,
    UserByIDDep,
    UserManagerDep,
    current_active_superuser,
)
from app.api.auth.examples import ADMIN_USERS_RESPONSE_EXAMPLES
from app.api.auth.filters import UserFilter
from app.api.auth.models import User
from app.api.auth.schemas import UserRead
from app.api.auth.services import mfa_service
from app.api.common.audit import AuditAction, AuditContext, audit_event
from app.api.common.crud.filtering import create_filter_dependency
from app.api.common.crud.query import page_models
from app.api.common.routers.dependencies import AsyncSessionDep

router = APIRouter(prefix="/admin/users", tags=["admin"], dependencies=[Security(current_active_superuser)])


## GET ##
@router.get(
    "",
    summary="View all users",
    response_model=Page[UserRead],
    responses={
        200: {
            "description": "List of users",
            "content": {
                "application/json": {"examples": ADMIN_USERS_RESPONSE_EXAMPLES},
            },
        },
    },
)
async def get_users(
    user_filter: Annotated[UserFilter, Depends(create_filter_dependency(UserFilter))],
    session: AsyncSessionDep,
) -> Page[UserRead]:
    """Get a list of all users with optional filtering."""
    return cast(
        "Page[UserRead]",
        await page_models(session, User, filters=user_filter, read_schema=UserRead),
    )


@router.get(
    "/{user_id}",  # noqa: FAST003 # user_id is bound by the get_user_or_404 dependency
    summary="View a single user by ID",
    response_model=UserRead,
)
async def get_user(user: UserByIDDep) -> User:
    """Get a user by ID."""
    return user


## DELETE ##
@router.delete(
    "/{user_id}",  # noqa: FAST003 # user_id is bound by the get_user_or_404 dependency
    summary="Delete a user by ID",
    status_code=204,
)
async def delete_user(
    user: UserByIDDep,
    user_manager: UserManagerDep,
    actor: CurrentActiveSuperUserDep,
    request: Request,
) -> None:
    """Delete a user by ID."""
    # `request` reaches UserManager.on_before_delete, which revokes the user's refresh
    # tokens before the row is removed. The built-in fastapi-users delete route relies
    # on the same hook, so revocation is not duplicated here.
    await user_manager.delete(user, request=request)
    audit_event(actor.id, AuditAction.DELETE, User, user.id)


@router.post(
    "/{user_id}/mfa/reset",  # noqa: FAST003 # user_id is bound by the get_user_or_404 dependency
    summary="Reset a user's MFA enrollment",
    status_code=204,
)
async def reset_user_mfa(
    user: UserByIDDep,
    user_manager: UserManagerDep,
    actor: CurrentActiveSuperUserDep,
) -> None:
    """Reset TOTP MFA after an administrator performs identity-proofed recovery."""
    await mfa_service.clear_totp(user_manager, user)
    audit_event(actor.id, AuditAction.SUPERUSER_ACCESS, User, user.id, context=AuditContext(operation="mfa_reset"))
