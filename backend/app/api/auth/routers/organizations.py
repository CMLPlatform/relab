"""Public routes for managing organizations."""

from typing import Annotated, cast

from fastapi_filter import FilterDepends
from fastapi_pagination import Page
from pydantic import UUID4

from app.api.auth.crud.organizations import (
    create_organization as create_organization_record,
)
from app.api.auth.crud.organizations import (
    get_organization_members as get_org_members,
)
from app.api.auth.crud.organizations import (
    get_organizations as get_orgs,
)
from app.api.auth.crud.organizations import (
    user_join_organization,
)
from app.api.auth.dependencies import CurrentActiveVerifiedUserDep
from app.api.auth.filters import OrganizationFilter
from app.api.auth.models import Organization, User
from app.api.auth.schemas import (
    OrganizationCreate,
    OrganizationRead,
    OrganizationReadPublic,
    UserReadPublic,
    UserReadWithOrganization,
)
from app.api.common.crud.query import require_model
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter

router = PublicAPIRouter(prefix="/organizations", tags=["organizations"])


### Main organization routes ###
@router.get("", summary="View all organizations", response_model=Page[OrganizationReadPublic])
async def get_organizations(
    org_filter: Annotated[OrganizationFilter, FilterDepends(OrganizationFilter)], session: AsyncSessionDep
) -> Page[OrganizationReadPublic]:
    """Get a list of all organizations with optional filtering."""
    return cast(
        "Page[OrganizationReadPublic]",
        await get_orgs(session, filters=org_filter, read_schema=OrganizationReadPublic),
    )


@router.get(
    "/{organization_id}",
    summary="View a single organization",
    response_model=OrganizationReadPublic,
)
async def get_organization(organization_id: UUID4, session: AsyncSessionDep) -> Organization:
    """Get an organization by ID."""
    return await require_model(session, Organization, organization_id)


@router.post("", response_model=OrganizationRead, status_code=201, summary="Create new organization")
async def create_organization(
    organization: OrganizationCreate, current_user: CurrentActiveVerifiedUserDep, session: AsyncSessionDep
) -> Organization:
    """Create new organization with current user as owner."""
    return await create_organization_record(session, organization, current_user)


## Organization member routes ##
@router.get(
    "/{organization_id}/members", response_model=Page[UserReadPublic], summary="Get the members of an organization"
)
async def get_organization_members(
    organization_id: UUID4, current_user: CurrentActiveVerifiedUserDep, session: AsyncSessionDep
) -> Page[UserReadPublic]:
    """Get the members of an organization."""
    return cast(
        "Page[UserReadPublic]",
        await get_org_members(
            session,
            organization_id,
            current_user,
            paginate=True,
            read_schema=UserReadPublic,
        ),
    )


@router.post(
    "/{organization_id}/members/me",
    response_model=UserReadWithOrganization,
    status_code=201,
    summary="Join organization",
)
async def join_organization(
    organization_id: UUID4, session: AsyncSessionDep, current_user: CurrentActiveVerifiedUserDep
) -> User:
    """Join an organization as a member."""
    organization = await require_model(session, Organization, organization_id)
    return await user_join_organization(session, organization, current_user)
