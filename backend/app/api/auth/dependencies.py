"""FastAPI dependencies for the auth module."""

from typing import Annotated

from fastapi import Depends, Security
from pydantic import UUID4
from sqlalchemy import inspect
from sqlalchemy.orm.attributes import NO_VALUE

from app.api.auth.exceptions import UserDoesNotOwnOrgError, UserHasNoOrgError
from app.api.auth.models import Organization, OrganizationRole, User
from app.api.auth.services.user_database import UserDatabaseAsync
from app.api.auth.services.user_manager import UserManager, fastapi_user_manager, get_user_db, get_user_manager
from app.api.common.crud.query import require_model
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


def _loaded_user_organization(current_user: User) -> Organization | None:
    """Return a loaded organization relationship without triggering async lazy loading."""
    loaded_value = inspect(current_user).attrs.organization.loaded_value
    if loaded_value is NO_VALUE:
        return None
    return loaded_value


async def get_current_user_organization(
    current_user: CurrentActiveVerifiedUserDep,
    session: AsyncSessionDep,
) -> Organization:
    """Return the current user's organization or raise a stable not-found error."""
    if current_user.organization_id is None:
        raise UserHasNoOrgError(user_id=current_user.id)

    organization = _loaded_user_organization(current_user)
    if organization is not None:
        return organization

    return await require_model(
        session,
        Organization,
        current_user.organization_id,
    )


async def get_current_user_owned_organization(
    current_user: CurrentActiveVerifiedUserDep,
    session: AsyncSessionDep,
) -> Organization:
    """Return the current user's organization when they are its owner."""
    if current_user.organization_role != OrganizationRole.OWNER or current_user.organization_id is None:
        raise UserDoesNotOwnOrgError(user_id=current_user.id)

    organization = _loaded_user_organization(current_user)
    if organization is not None:
        return organization

    return await require_model(
        session,
        Organization,
        current_user.organization_id,
        loaders={"members", "owner"},
    )


CurrentUserOrgDep = Annotated[Organization, Depends(get_current_user_organization)]
CurrentUserOwnedOrgDep = Annotated[Organization, Depends(get_current_user_owned_organization)]
