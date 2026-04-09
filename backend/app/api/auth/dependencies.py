"""FastAPI dependencies for the auth module."""

from typing import Annotated

from fastapi import Depends, Security
from pydantic import UUID4

from app.api.auth.exceptions import UserDoesNotOwnOrgError, UserHasNoOrgError
from app.api.auth.models import Organization, OrganizationRole, User
from app.api.auth.services.user_database import UserDatabaseAsync
from app.api.auth.services.user_manager import UserManager, fastapi_user_manager, get_user_db, get_user_manager
from app.api.common.crud.base import get_model_by_id
from app.api.common.routers.dependencies import AsyncSessionDep

# Dependencies
current_active_user = fastapi_user_manager.current_user(active=True)
current_active_verified_user = fastapi_user_manager.current_user(active=True, verified=True)
current_active_superuser = fastapi_user_manager.current_user(active=True, superuser=True)
optional_current_active_user = fastapi_user_manager.current_user(optional=True)

# Annotated dependency types. For example usage, see the `authenticated_route` function in the auth.routers module.
UserDBDep = Annotated[UserDatabaseAsync[User, UUID4], Depends(get_user_db)]
UserManagerDep = Annotated[UserManager, Depends(get_user_manager)]
CurrentActiveUserDep = Annotated[User, Security(current_active_user)]
CurrentActiveVerifiedUserDep = Annotated[User, Security(current_active_verified_user)]
CurrentActiveSuperUserDep = Annotated[User, Security(current_active_superuser)]
OptionalCurrentActiveUserDep = Annotated[User | None, Security(optional_current_active_user)]


async def get_current_user_organization(current_user: CurrentActiveVerifiedUserDep) -> Organization:
    """Return the current user's organization or raise a stable not-found error."""
    if current_user.organization is None:
        raise UserHasNoOrgError(user_id=current_user.id)
    return current_user.organization


async def get_current_user_owned_organization(
    current_user: CurrentActiveVerifiedUserDep,
    session: AsyncSessionDep,
) -> Organization:
    """Return the current user's organization when they are its owner."""
    if current_user.organization_role != OrganizationRole.OWNER or current_user.organization_id is None:
        raise UserDoesNotOwnOrgError(user_id=current_user.id)

    if current_user.organization is not None:
        return current_user.organization

    return await get_model_by_id(
        session,
        Organization,
        current_user.organization_id,
        include_relationships={"members", "owner"},
    )


CurrentUserOrgDep = Annotated[Organization, Depends(get_current_user_organization)]
CurrentUserOwnedOrgDep = Annotated[Organization, Depends(get_current_user_owned_organization)]
