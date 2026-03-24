"""Admin routes for managing organizations."""

from typing import Annotated

from fastapi import APIRouter, Query, Security
from fastapi_filter import FilterDepends
from fastapi_pagination import Page
from pydantic import UUID4

from app.api.auth import crud
from app.api.auth.dependencies import current_active_superuser
from app.api.auth.filters import OrganizationFilter
from app.api.auth.models import Organization
from app.api.auth.schemas import OrganizationReadWithRelationships
from app.api.common.crud.base import get_model_by_id
from app.api.common.routers.dependencies import AsyncSessionDep

router = APIRouter(prefix="/admin/organizations", tags=["admin"], dependencies=[Security(current_active_superuser)])


@router.get("", response_model=Page[OrganizationReadWithRelationships], summary="Get all organizations")
async def get_all_organizations(
    session: AsyncSessionDep,
    org_filter: Annotated[OrganizationFilter, FilterDepends(OrganizationFilter)],
    include: Annotated[
        set[str] | None,
        Query(
            description="Relationships to include",
            openapi_examples={
                "none": {"value": []},
                "all": {"value": ["owner", "members"]},
            },
        ),
    ] = None,
) -> Page[Organization]:
    """Get all organizations with optional relationships. Only superusers can access this route."""
    return await crud.get_organizations(
        session,
        include_relationships=include,
        model_filter=org_filter,
        read_schema=OrganizationReadWithRelationships,
    )


@router.get("/{organization_id}", response_model=OrganizationReadWithRelationships, summary="Get organization by ID")
async def get_organization_with_relationships(
    organization_id: UUID4,
    session: AsyncSessionDep,
    include: Annotated[
        set[str] | None,
        Query(
            description="Relationships to include",
            openapi_examples={
                "none": {"value": []},
                "all": {"value": ["owner", "members"]},
            },
        ),
    ] = None,
) -> Organization:
    """Get organization by ID with optional relationships. Only superusers can access this route."""
    return await get_model_by_id(session, Organization, organization_id, include_relationships=include)


@router.delete("/{organization_id}", status_code=204, summary="Delete organization by ID")
async def delete_organization(organization_id: UUID4, session: AsyncSessionDep) -> None:
    """Delete organization by ID. Only superusers can access this route."""
    await crud.force_delete_organization(session, organization_id)
