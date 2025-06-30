"""FastAPI dependencies for the auth module."""

from typing import Annotated

from fastapi import Depends, Security
from pydantic import UUID4

from app.api.auth.exceptions import UserDoesNotOwnOrgError, UserIsNotMemberError
from app.api.auth.models import Organization, OrganizationRole, User
from app.api.auth.services.user_manager import UserManager, fastapi_user_manager, get_user_manager
from app.api.common.crud.utils import db_get_model_with_id_if_it_exists
from app.api.common.routers.dependencies import AsyncSessionDep

# Dependencies
current_active_user = fastapi_user_manager.current_user(active=True)
current_active_verified_user = fastapi_user_manager.current_user(active=True, verified=True)
current_active_superuser = fastapi_user_manager.current_user(active=True, superuser=True)
optional_current_active_user = fastapi_user_manager.current_user(optional=True)

# Annotated dependency types. For example usage, see the `authenticated_route` function in the auth.routers module.
UserManagerDep = Annotated[UserManager, Depends(get_user_manager)]
CurrentActiveUserDep = Annotated[User, Security(current_active_user)]
CurrentActiveVerifiedUserDep = Annotated[User, Security(current_active_verified_user)]
CurrentActiveSuperUserDep = Annotated[User, Security(current_active_superuser)]
OptionalCurrentActiveUserDep = Annotated[User | None, Security(optional_current_active_user)]


# Organizations


async def get_org_by_id(
    organization_id: UUID4,
    session: AsyncSessionDep,
) -> Organization:
    """Get a valid organization by ID."""
    return await db_get_model_with_id_if_it_exists(session, Organization, organization_id)


async def get_org_by_id_as_owner(
    organization_id: UUID4,
    current_user: CurrentActiveVerifiedUserDep,
) -> Organization:
    """Dependency function to retrieve an organization by ID and ensure it's owned by the current user."""
    if (
        current_user.organization
        and current_user.organization_id == organization_id
        and current_user.organization_role == OrganizationRole.OWNER
    ):
        return current_user.organization

    raise UserDoesNotOwnOrgError


async def get_org_by_id_as_member(
    organization_id: UUID4,
    current_user: CurrentActiveVerifiedUserDep,
) -> Organization:
    """Dependency function to retrieve an organization by ID and ensure the current user is a member."""
    if current_user.organization and current_user.organization_id == organization_id:
        return current_user.organization
    raise UserIsNotMemberError


OrgByID = Annotated[Organization, Depends(get_org_by_id)]
OrgAsOwner = Annotated[Organization, Depends(get_org_by_id_as_owner)]
OrgAsMember = Annotated[Organization, Depends(get_org_by_id_as_member)]
