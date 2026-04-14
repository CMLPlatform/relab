"""Admin routes for managing organizations."""

from typing import Annotated

from fastapi import APIRouter, Security
from fastapi_filter import FilterDepends
from fastapi_pagination import Page
from pydantic import UUID4

from app.api.auth import crud
from app.api.auth.dependencies import current_active_superuser
from app.api.auth.filters import OrganizationFilter
from app.api.auth.models import Organization
from app.api.auth.schemas import OrganizationReadWithRelationships
from app.api.common.crud.query import require_model
from app.api.common.routers.dependencies import AsyncSessionDep

router = APIRouter(prefix="/admin/organizations", tags=["admin"], dependencies=[Security(current_active_superuser)])


@router.get(
    "", response_model=Page[OrganizationReadWithRelationships], summary="Get all organizations with all relationships"
)
async def get_all_organizations(
    session: AsyncSessionDep,
    org_filter: Annotated[OrganizationFilter, FilterDepends(OrganizationFilter)],
) -> Page[Organization]:
    """Get all organizations with all relationships loaded. Only superusers can access this route."""
    return await crud.get_organizations(
        session,
        loaders={"members"},
        filters=org_filter,
        read_schema=OrganizationReadWithRelationships,
    )


@router.get(
    "/{organization_id}",
    response_model=OrganizationReadWithRelationships,
    summary="Get organization by ID with all relationships",
)
async def get_organization_with_relationships(
    organization_id: UUID4,
    session: AsyncSessionDep,
) -> Organization:
    """Get organization by ID with all relationships loaded. Only superusers can access this route."""
    return await require_model(
        session,
        Organization,
        organization_id,
        loaders={"members"},
        read_schema=OrganizationReadWithRelationships,
    )


@router.delete("/{organization_id}", status_code=204, summary="Delete organization by ID")
async def delete_organization(organization_id: UUID4, session: AsyncSessionDep) -> None:
    """Delete organization by ID. Only superusers can access this route."""
    await crud.force_delete_organization(session, organization_id)
