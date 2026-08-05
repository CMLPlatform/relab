"""Admin routes for managing users."""

from typing import Annotated, cast

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Security
from fastapi_pagination import Page
from fastapi_users.exceptions import InvalidPasswordException, UserAlreadyExists

from app.api.auth.dependencies import (
    CurrentActiveSuperUserDep,
    UserByIDDep,
    UserManagerDep,
    current_active_superuser,
)
from app.api.auth.examples import ADMIN_USERS_RESPONSE_EXAMPLES
from app.api.auth.filters import UserFilter
from app.api.auth.models import User
from app.api.auth.schemas import UserRead, UserUpdate
from app.api.auth.services import mfa_service
from app.api.auth.services.account_erasure import ANONYMIZE, ErasureContent, erase_user, require_erasable_account
from app.api.auth.services.account_security import revoke_user_refresh_tokens
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


## PATCH ##
@router.patch(
    "/{user_id}",  # noqa: FAST003 # user_id is bound by the get_user_or_404 dependency
    summary="Update a user by ID",
    response_model=UserRead,
)
async def update_user(
    user_update: UserUpdate,
    user: UserByIDDep,
    user_manager: UserManagerDep,
    actor: CurrentActiveSuperUserDep,
    request: Request,
) -> User:
    """Update a user by ID without requiring the target account's password.

    `safe=False` lets an administrator change fields the self-service route
    reauthenticates for; UserManager skips the current-password gate on this path.
    """
    try:
        updated = await user_manager.update(user_update, user, safe=False, request=request)
    except UserAlreadyExists as e:
        # Admins are trusted, so unlike registration there is nothing to hide here.
        raise HTTPException(status_code=409, detail="A user with this email already exists") from e
    except InvalidPasswordException as e:
        raise HTTPException(status_code=400, detail=str(e.reason)) from e
    audit_event(actor.id, AuditAction.UPDATE, User, user.id)
    return updated


## DELETE ##
@router.delete(
    "/{user_id}",  # noqa: FAST003 # user_id is bound by the get_user_or_404 dependency
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
    # Guard before revoking, so a refused erasure has no side effects at all. Then revoke
    # before erasing, as UserManager.on_before_delete did: a Redis failure aborts the
    # erasure rather than leaving a deleted user whose sessions are still live.
    await require_erasable_account(session, user)
    await revoke_user_refresh_tokens(user.id, request)
    await erase_user(session, user, content=content)
    audit_event(actor.id, AuditAction.DELETE, User, user.id, context=AuditContext(operation=f"erase_{content}"))


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
