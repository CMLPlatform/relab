"""Admin taxonomy routers for reference data."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import PositiveInt

from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.reference_data.crud.taxonomies import create_taxonomy as create_taxonomy_record
from app.api.reference_data.crud.taxonomies import delete_taxonomy as delete_taxonomy_record
from app.api.reference_data.crud.taxonomies import update_taxonomy as update_taxonomy_record
from app.api.reference_data.models import Taxonomy
from app.api.reference_data.schemas import (
    TaxonomyCreate,
    TaxonomyCreateWithCategories,
    TaxonomyRead,
    TaxonomyUpdate,
)

router = APIRouter(prefix="/taxonomies", tags=["taxonomies"])


@router.post("", response_model=TaxonomyRead, summary="Create a new taxonomy", status_code=201)
async def create_taxonomy(
    taxonomy: TaxonomyCreate | TaxonomyCreateWithCategories,
    session: AsyncSessionDep,
) -> Taxonomy:
    """Create a new taxonomy, optionally with categories."""
    return await create_taxonomy_record(session, taxonomy)


@router.patch("/{taxonomy_id}", response_model=TaxonomyRead, summary="Update taxonomy")
async def update_taxonomy(
    taxonomy_id: PositiveInt,
    taxonomy: TaxonomyUpdate,
    session: AsyncSessionDep,
) -> Taxonomy:
    """Update an existing taxonomy."""
    return await update_taxonomy_record(session, taxonomy_id, taxonomy)


@router.delete("/{taxonomy_id}", summary="Delete taxonomy, including categories", status_code=204)
async def delete_taxonomy(taxonomy_id: PositiveInt, session: AsyncSessionDep) -> None:
    """Delete a taxonomy by ID, including its categories."""
    await delete_taxonomy_record(session, taxonomy_id)
