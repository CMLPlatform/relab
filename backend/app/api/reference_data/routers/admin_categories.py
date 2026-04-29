"""Admin category routers for reference data."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import PositiveInt

from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.reference_data.crud.categories import create_category as create_category_record
from app.api.reference_data.crud.categories import delete_category as delete_category_record
from app.api.reference_data.crud.categories import update_category as update_category_record
from app.api.reference_data.models import Category
from app.api.reference_data.schemas import CategoryCreate, CategoryRead, CategoryUpdate

router = APIRouter(prefix="/categories", tags=["categories"])


@router.post("", response_model=CategoryRead, summary="Create a new category", status_code=201)
async def create_category(
    category: CategoryCreate,
    session: AsyncSessionDep,
) -> Category:
    """Create a category.

    ``taxonomy_id`` is required for root categories and is inherited from the
    parent when ``supercategory_id`` is supplied.
    """
    return await create_category_record(session, category)


@router.patch("/{category_id}", response_model=CategoryRead, summary="Update category")
async def update_category(
    category_id: PositiveInt,
    category: CategoryUpdate,
    session: AsyncSessionDep,
) -> Category:
    """Update an existing category."""
    return await update_category_record(session, category_id, category)


@router.delete("/{category_id}", summary="Delete category", status_code=204)
async def delete_category(category_id: PositiveInt, session: AsyncSessionDep) -> None:
    """Delete a category by ID, including its subcategories."""
    await delete_category_record(session, category_id)
