"""Admin category routers for background data."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import PositiveInt

from app.api.background_data import crud
from app.api.background_data.models import Category
from app.api.background_data.schemas import (
    CategoryCreateWithinCategoryWithSubCategories,
    CategoryCreateWithSubCategories,
    CategoryRead,
    CategoryUpdate,
)
from app.api.common.crud.base import get_nested_model_by_id
from app.api.common.routers.dependencies import AsyncSessionDep

router = APIRouter(prefix="/categories", tags=["categories"])


@router.post("", response_model=CategoryRead, summary="Create a new category", status_code=201)
async def create_category(
    category: CategoryCreateWithSubCategories,
    session: AsyncSessionDep,
) -> Category:
    """Create a new category, optionally with subcategories."""
    return await crud.create_category(session, category)


@router.patch("/{category_id}", response_model=CategoryRead, summary="Update category")
async def update_category(
    category_id: PositiveInt,
    category: CategoryUpdate,
    session: AsyncSessionDep,
) -> Category:
    """Update an existing category."""
    return await crud.update_category(session, category_id, category)


@router.delete("/{category_id}", summary="Delete category", status_code=204)
async def delete_category(category_id: PositiveInt, session: AsyncSessionDep) -> None:
    """Delete a category by ID, including its subcategories."""
    await crud.delete_category(session, category_id)


@router.post("/{category_id}/subcategories", response_model=CategoryRead, status_code=201)
async def create_subcategory(
    category_id: PositiveInt,
    category: CategoryCreateWithinCategoryWithSubCategories,
    session: AsyncSessionDep,
) -> Category:
    """Create a new subcategory under an existing category."""
    return await crud.create_category(db=session, category=category, supercategory_id=category_id)


@router.delete("/{category_id}/subcategories/{subcategory_id}", summary="Delete category", status_code=204)
async def delete_subcategory(category_id: PositiveInt, subcategory_id: PositiveInt, session: AsyncSessionDep) -> None:
    """Delete a subcategory by ID, including its subcategories."""
    await get_nested_model_by_id(session, Category, category_id, Category, subcategory_id, "supercategory_id")
    await crud.delete_category(session, subcategory_id)
