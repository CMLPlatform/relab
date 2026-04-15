"""Public category routers for background data."""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated

from fastapi import Path, Request
from fastapi_pagination import Page
from pydantic import PositiveInt
from sqlalchemy import select

from app.api.background_data.crud.categories import get_category_trees
from app.api.background_data.dependencies import CategoryFilterDep, CategoryFilterWithRelationshipsDep
from app.api.background_data.models import Category
from app.api.background_data.routers.public_support import (
    BackgroundDataAPIRouter,
    RecursionDepthQueryParam,
    convert_subcategories_to_read_model,
)
from app.api.background_data.schemas import (
    CategoryReadWithRecursiveSubCategories,
    CategoryReadWithRelationshipsAndFlatSubCategories,
)
from app.api.common.crud.exceptions import DependentModelOwnershipError
from app.api.common.crud.loading import apply_loader_profile
from app.api.common.crud.query import page_models, require_model
from app.api.common.routers.dependencies import AsyncSessionDep
from app.core.responses import conditional_json_response

if TYPE_CHECKING:
    from collections.abc import Sequence

    from starlette.responses import Response

router = BackgroundDataAPIRouter(prefix="/categories", tags=["categories"])


async def _require_category_with_relationships(session: AsyncSessionDep, category_id: PositiveInt) -> Category:
    """Load one category with the standard public relationships."""
    return await require_model(
        session,
        Category,
        category_id,
        loaders={"taxonomy", "subcategories", "materials", "product_types"},
        read_schema=CategoryReadWithRelationshipsAndFlatSubCategories,
    )


@router.get(
    "",
    response_model=Page[CategoryReadWithRelationshipsAndFlatSubCategories],
    summary="Get all categories with optional filtering and all relationships",
)
async def get_categories(
    request: Request,
    session: AsyncSessionDep,
    category_filter: CategoryFilterWithRelationshipsDep,
) -> Page[Category] | Response:
    """Get all categories with all relationships loaded."""
    payload = await page_models(
        session,
        Category,
        loaders={"taxonomy", "subcategories", "materials", "product_types"},
        filters=category_filter,
        read_schema=CategoryReadWithRelationshipsAndFlatSubCategories,
    )
    return conditional_json_response(request, payload)


@router.get(
    "/tree",
    response_model=list[CategoryReadWithRecursiveSubCategories],
    summary="Get categories tree",
)
async def get_categories_tree(
    request: Request,
    session: AsyncSessionDep,
    category_filter: CategoryFilterWithRelationshipsDep,
    recursion_depth: RecursionDepthQueryParam = 1,
) -> list[CategoryReadWithRecursiveSubCategories] | Response:
    """Get all base categories and their subcategories in a tree structure."""
    categories: Sequence[Category] = await get_category_trees(
        session, recursion_depth, category_filter=category_filter
    )
    payload = [
        CategoryReadWithRecursiveSubCategories.model_validate(category).model_copy(
            update={
                "subcategories": convert_subcategories_to_read_model(
                    category.subcategories or [], max_depth=recursion_depth - 1
                )
            }
        )
        for category in categories
    ]
    return conditional_json_response(request, payload)


@router.get(
    "/{category_id}",
    response_model=CategoryReadWithRelationshipsAndFlatSubCategories,
)
async def get_category(
    request: Request,
    session: AsyncSessionDep,
    category_id: PositiveInt,
) -> Category | Response:
    """Get category by ID with all relationships."""
    payload = await _require_category_with_relationships(session, category_id)
    updated_at = getattr(payload, "updated_at", None)
    etag_seed = f"category:{category_id}:{updated_at}"
    return conditional_json_response(request, payload, etag_seed=etag_seed)


@router.get(
    "{category_id}/subcategories",
    response_model=Page[CategoryReadWithRelationshipsAndFlatSubCategories],
    summary="Get category subcategories with optional filtering and all relationships",
)
async def get_subcategories(
    category_id: Annotated[PositiveInt, Path(description="Category ID")],
    category_filter: CategoryFilterDep,
    session: AsyncSessionDep,
) -> Page[Category]:
    """Get paginated subcategories of a category with all relationships loaded."""
    await require_model(session, Category, category_id)
    statement = select(Category).where(Category.supercategory_id == category_id)
    return await page_models(
        session,
        Category,
        loaders={"taxonomy", "subcategories", "materials", "product_types"},
        filters=category_filter,
        statement=statement,
        read_schema=CategoryReadWithRelationshipsAndFlatSubCategories,
    )


@router.get(
    "/{category_id}/subcategories/tree",
    summary="Get category subtree",
    response_model=list[CategoryReadWithRecursiveSubCategories],
)
async def get_category_subtree(
    category_id: PositiveInt,
    category_filter: CategoryFilterDep,
    session: AsyncSessionDep,
    recursion_depth: RecursionDepthQueryParam = 1,
) -> list[CategoryReadWithRecursiveSubCategories]:
    """Get a category subcategories in a tree structure, up to a specified depth."""
    categories: Sequence[Category] = await get_category_trees(
        session, recursion_depth=recursion_depth, supercategory_id=category_id, category_filter=category_filter
    )
    return [
        CategoryReadWithRecursiveSubCategories.model_validate(category).model_copy(
            update={
                "subcategories": convert_subcategories_to_read_model(
                    category.subcategories or [], max_depth=recursion_depth - 1
                )
            }
        )
        for category in categories
    ]


@router.get(
    "/{category_id}/subcategories/{subcategory_id}",
    response_model=CategoryReadWithRelationshipsAndFlatSubCategories,
    summary="Get subcategory by ID with all relationships",
)
async def get_subcategory(
    category_id: PositiveInt,
    subcategory_id: PositiveInt,
    session: AsyncSessionDep,
) -> Category:
    """Get subcategory by ID with all relationships loaded."""
    await _require_category_with_relationships(session, category_id)
    statement = select(Category).where(Category.id == subcategory_id, Category.supercategory_id == category_id)
    statement = apply_loader_profile(
        statement,
        Category,
        {"taxonomy", "subcategories", "materials", "product_types"},
        read_schema=CategoryReadWithRelationshipsAndFlatSubCategories,
    )
    subcategory = (await session.execute(statement)).scalars().unique().one_or_none()
    if subcategory is not None:
        return subcategory

    existing = await _require_category_with_relationships(session, subcategory_id)
    if existing.supercategory_id != category_id:
        raise DependentModelOwnershipError(Category, subcategory_id, Category, category_id)
    return existing
