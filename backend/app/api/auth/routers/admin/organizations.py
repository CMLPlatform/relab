"""Admin routes for managing organizations."""

from collections.abc import Sequence
from typing import Annotated

from fastapi import APIRouter, Query, Security
from pydantic import UUID4

from app.api.auth.crud import force_delete_organization
from app.api.auth.dependencies import current_active_superuser
from app.api.auth.models import Organization
from app.api.auth.schemas import OrganizationReadWithRelationships
from app.api.common.crud.base import get_model_by_id, get_models
from app.api.common.routers.dependencies import AsyncSessionDep

router = APIRouter(prefix="/admin/organizations", tags=["admin"], dependencies=[Security(current_active_superuser)])


@router.get("", response_model=list[OrganizationReadWithRelationships], summary="Get all organizations")
async def get_all_organizations(
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
) -> Sequence[Organization]:
    """Get all organizations with optional relationships. Only superusers can access this route."""
    return await get_models(session, Organization, include_relationships=include)


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
    await force_delete_organization(session, organization_id)
