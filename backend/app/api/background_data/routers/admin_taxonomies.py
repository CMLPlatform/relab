"""Admin taxonomy routers for background data."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import PositiveInt

from app.api.background_data import crud
from app.api.background_data.models import Category, Taxonomy
from app.api.background_data.schemas import (
    CategoryCreateWithinTaxonomyWithSubCategories,
    CategoryRead,
    TaxonomyCreate,
    TaxonomyCreateWithCategories,
    TaxonomyRead,
    TaxonomyUpdate,
)
from app.api.common.crud.scopes import require_scoped_model
from app.api.common.routers.dependencies import AsyncSessionDep

router = APIRouter(prefix="/taxonomies", tags=["taxonomies"])


@router.post("", response_model=TaxonomyRead, summary="Create a new taxonomy", status_code=201)
async def create_taxonomy(
    taxonomy: TaxonomyCreate | TaxonomyCreateWithCategories,
    session: AsyncSessionDep,
) -> Taxonomy:
    """Create a new taxonomy, optionally with categories."""
    return await crud.create_taxonomy(session, taxonomy)


@router.patch("/{taxonomy_id}", response_model=TaxonomyRead, summary="Update taxonomy")
async def update_taxonomy(
    taxonomy_id: PositiveInt,
    taxonomy: TaxonomyUpdate,
    session: AsyncSessionDep,
) -> Taxonomy:
    """Update an existing taxonomy."""
    return await crud.update_taxonomy(session, taxonomy_id, taxonomy)


@router.delete("/{taxonomy_id}", summary="Delete taxonomy, including categories", status_code=204)
async def delete_taxonomy(taxonomy_id: PositiveInt, session: AsyncSessionDep) -> None:
    """Delete a taxonomy by ID, including its categories."""
    await crud.delete_taxonomy(session, taxonomy_id)


@router.post(
    "/{taxonomy_id}/categories",
    response_model=CategoryRead,
    summary="Create a new category in a taxonomy",
    status_code=201,
)
async def create_category_in_taxonomy(
    taxonomy_id: PositiveInt,
    category: CategoryCreateWithinTaxonomyWithSubCategories,
    session: AsyncSessionDep,
) -> Category:
    """Create a new category in a taxonomy, optionally with subcategories."""
    return await crud.create_category(db=session, category=category, taxonomy_id=taxonomy_id)


@router.delete("/{taxonomy_id}/categories/{category_id}", summary="Delete category in a taxonomy", status_code=204)
async def delete_category_in_taxonomy(
    taxonomy_id: PositiveInt, category_id: PositiveInt, session: AsyncSessionDep
) -> None:
    """Delete a category by ID, including its subcategories."""
    await require_scoped_model(session, Taxonomy, taxonomy_id, Category, category_id, "taxonomy_id")
    await crud.delete_category(session, category_id)
