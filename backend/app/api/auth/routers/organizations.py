"""Public routes for managing organizations."""

from collections.abc import Sequence
from typing import Annotated

from fastapi import APIRouter
from fastapi_filter import FilterDepends
from pydantic import UUID4

from app.api.auth import crud
from app.api.auth.dependencies import CurrentActiveVerifiedUserDep, OrgByID
from app.api.auth.filters import OrganizationFilter
from app.api.auth.models import Organization, User
from app.api.auth.schemas import (
    OrganizationCreate,
    OrganizationRead,
    OrganizationReadPublic,
    UserReadPublic,
    UserReadWithOrganization,
)
from app.api.common.crud.base import get_models
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import mark_router_routes_public

router = APIRouter(prefix="/organizations", tags=["organizations"])


### Main organization routes ###
@router.get("", summary="View all organizations", response_model=list[OrganizationReadPublic])
async def get_organizations(
    org_filter: Annotated[OrganizationFilter, FilterDepends(OrganizationFilter)], session: AsyncSessionDep
) -> Sequence[Organization]:
    """Get a list of all organizations with optional filtering."""
    return await get_models(session, Organization, model_filter=org_filter)


@router.get(
    "/{organization_id}",  # noqa: FAST003 # organization_id is used by OrgByID dependency
    summary="View a single organization",
    response_model=OrganizationReadPublic,
)
async def get_organization(organization: OrgByID) -> Organization:
    """Get an organization by ID."""
    return organization


@router.post("", response_model=OrganizationRead, status_code=201, summary="Create new organization")
async def create_organization(
    organization: OrganizationCreate, current_user: CurrentActiveVerifiedUserDep, session: AsyncSessionDep
) -> Organization:
    """Create new organization with current user as owner."""
    db_org = await crud.create_organization(session, organization, current_user)

    return db_org


## Organization member routes ##
@router.get(
    "/{organization_id}/members", response_model=list[UserReadPublic], summary="Get the members of an organization"
)
async def get_organization_members(
    organization_id: UUID4, current_user: CurrentActiveVerifiedUserDep, session: AsyncSessionDep
) -> list[User]:
    """Get the members of an organization."""
    return await crud.get_organization_members(session, organization_id, current_user)


@router.post(
    "/{organization_id}/members/me",  # noqa: FAST003 # organization_id is used by OrgByID dependency
    response_model=UserReadWithOrganization,
    status_code=201,
    summary="Join organization",
)
async def join_organization(
    organization: OrgByID, session: AsyncSessionDep, current_user: CurrentActiveVerifiedUserDep
) -> User:
    """Join an organization as a member."""
    return await crud.user_join_organization(session, organization, current_user)


# TODO: Initializing as PublicRouter doesn't seem to work, need to manually mark all routes as public. Investigate why.
mark_router_routes_public(router)
