"""Admin taxonomy routers for background data."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import PositiveInt
from sqlalchemy import select

from app.api.background_data.crud.categories import create_category as create_category_record
from app.api.background_data.crud.categories import delete_category as delete_category_record
from app.api.background_data.crud.taxonomies import create_taxonomy as create_taxonomy_record
from app.api.background_data.crud.taxonomies import delete_taxonomy as delete_taxonomy_record
from app.api.background_data.crud.taxonomies import update_taxonomy as update_taxonomy_record
from app.api.background_data.models import Category, Taxonomy
from app.api.background_data.schemas import (
    CategoryCreateWithinTaxonomyWithSubCategories,
    CategoryRead,
    TaxonomyCreate,
    TaxonomyCreateWithCategories,
    TaxonomyRead,
    TaxonomyUpdate,
)
from app.api.common.crud.exceptions import DependentModelOwnershipError
from app.api.common.crud.query import require_model
from app.api.common.routers.dependencies import AsyncSessionDep

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
    return await create_category_record(db=session, category=category, taxonomy_id=taxonomy_id)


@router.delete("/{taxonomy_id}/categories/{category_id}", summary="Delete category in a taxonomy", status_code=204)
async def delete_category_in_taxonomy(
    taxonomy_id: PositiveInt, category_id: PositiveInt, session: AsyncSessionDep
) -> None:
    """Delete a category by ID, including its subcategories."""
    category = await require_model(session, Category, category_id)
    if category.taxonomy_id != taxonomy_id:
        raise DependentModelOwnershipError(Category, category_id, Taxonomy, taxonomy_id)
    exists = await session.scalar(
        select(Category.id).where(Category.id == category_id, Category.taxonomy_id == taxonomy_id)
    )
    if exists is None:
        raise DependentModelOwnershipError(Category, category_id, Taxonomy, taxonomy_id)
    await delete_category_record(session, category_id)
