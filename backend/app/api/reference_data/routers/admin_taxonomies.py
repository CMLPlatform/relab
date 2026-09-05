"""Admin taxonomy routers for reference data."""

from fastapi import APIRouter
from pydantic import PositiveInt

from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.reference_data.crud.persistence import delete_reference_model, update_reference_model
from app.api.reference_data.crud.taxonomies import create_taxonomy
from app.api.reference_data.models import Taxonomy
from app.api.reference_data.schemas import (
    TaxonomyCreateWithCategories,
    TaxonomyRead,
    TaxonomyUpdate,
)

router = APIRouter(prefix="/taxonomies", tags=["taxonomies"])


@router.post("", response_model=TaxonomyRead, summary="Create a new taxonomy", status_code=201)
async def create_taxonomy_endpoint(
    taxonomy: TaxonomyCreateWithCategories,
    session: AsyncSessionDep,
) -> Taxonomy:
    """Create a new taxonomy, optionally with categories."""
    return await create_taxonomy(session, taxonomy)


@router.patch("/{taxonomy_id}", response_model=TaxonomyRead, summary="Update taxonomy")
async def update_taxonomy(
    taxonomy_id: PositiveInt,
    taxonomy: TaxonomyUpdate,
    session: AsyncSessionDep,
) -> Taxonomy:
    """Update an existing taxonomy."""
    return await update_reference_model(session, Taxonomy, taxonomy_id, taxonomy)


@router.delete("/{taxonomy_id}", summary="Delete taxonomy, including categories", status_code=204)
async def delete_taxonomy(taxonomy_id: PositiveInt, session: AsyncSessionDep) -> None:
    """Delete a taxonomy by ID, including its categories."""
    await delete_reference_model(session, Taxonomy, taxonomy_id)
