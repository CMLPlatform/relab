"""Admin category routers for background data."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import PositiveInt
from sqlalchemy import select

from app.api.background_data.crud.categories import create_category as create_category_record
from app.api.background_data.crud.categories import delete_category as delete_category_record
from app.api.background_data.crud.categories import update_category as update_category_record
from app.api.background_data.models import Category
from app.api.background_data.schemas import (
    CategoryCreateWithinCategoryWithSubCategories,
    CategoryCreateWithSubCategories,
    CategoryRead,
    CategoryUpdate,
)
from app.api.common.crud.exceptions import DependentModelOwnershipError
from app.api.common.crud.query import require_model
from app.api.common.routers.dependencies import AsyncSessionDep

router = APIRouter(prefix="/categories", tags=["categories"])


@router.post("", response_model=CategoryRead, summary="Create a new category", status_code=201)
async def create_category(
    category: CategoryCreateWithSubCategories,
    session: AsyncSessionDep,
) -> Category:
    """Create a new category, optionally with subcategories."""
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


@router.post("/{category_id}/subcategories", response_model=CategoryRead, status_code=201)
async def create_subcategory(
    category_id: PositiveInt,
    category: CategoryCreateWithinCategoryWithSubCategories,
    session: AsyncSessionDep,
) -> Category:
    """Create a new subcategory under an existing category."""
    return await create_category_record(db=session, category=category, supercategory_id=category_id)


@router.delete("/{category_id}/subcategories/{subcategory_id}", summary="Delete category", status_code=204)
async def delete_subcategory(category_id: PositiveInt, subcategory_id: PositiveInt, session: AsyncSessionDep) -> None:
    """Delete a subcategory by ID, including its subcategories."""
    subcategory = await require_model(session, Category, subcategory_id)
    if subcategory.supercategory_id != category_id:
        raise DependentModelOwnershipError(Category, subcategory_id, Category, category_id)
    exists = await session.scalar(
        select(Category.id).where(Category.id == subcategory_id, Category.supercategory_id == category_id)
    )
    if exists is None:
        raise DependentModelOwnershipError(Category, subcategory_id, Category, category_id)
    await delete_category_record(session, subcategory_id)
