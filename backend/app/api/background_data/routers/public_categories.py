"""Public category routers for background data."""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated, cast

from fastapi import Path, Query
from fastapi_pagination import Page
from pydantic import PositiveInt
from sqlmodel import select

from app.api.background_data import crud
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
from app.api.common.crud.base import get_model_by_id, get_nested_model_by_id, get_paginated_models
from app.api.common.routers.dependencies import AsyncSessionDep

if TYPE_CHECKING:
    from collections.abc import Sequence

    from fastapi.openapi.models import Example

CATEGORY_INCLUDE_EXAMPLES = cast(
    "dict[str, Example]",
    {
        "none": {"value": []},
        "materials": {"value": ["materials"]},
        "all": {"value": ["materials", "product_types", "subcategories"]},
    },
)

router = BackgroundDataAPIRouter(prefix="/categories", tags=["categories"])


@router.get(
    "",
    response_model=Page[CategoryReadWithRelationshipsAndFlatSubCategories],
    summary="Get all categories with optional filtering and relationships",
)
async def get_categories(
    session: AsyncSessionDep,
    category_filter: CategoryFilterWithRelationshipsDep,
    include: Annotated[
        set[str] | None,
        Query(description="Relationships to include", openapi_examples=CATEGORY_INCLUDE_EXAMPLES),
    ] = None,
) -> Page[Category]:
    """Get all categories with specified relationships."""
    return await get_paginated_models(
        session,
        Category,
        include_relationships=include,
        model_filter=category_filter,
        read_schema=CategoryReadWithRelationshipsAndFlatSubCategories,
    )


@router.get(
    "/tree",
    response_model=list[CategoryReadWithRecursiveSubCategories],
    summary="Get categories tree",
)
async def get_categories_tree(
    session: AsyncSessionDep,
    category_filter: CategoryFilterWithRelationshipsDep,
    recursion_depth: RecursionDepthQueryParam = 1,
) -> list[CategoryReadWithRecursiveSubCategories]:
    """Get all base categories and their subcategories in a tree structure."""
    categories: Sequence[Category] = await crud.get_category_trees(
        session, recursion_depth, category_filter=category_filter
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
    "/{category_id}",
    response_model=CategoryReadWithRelationshipsAndFlatSubCategories,
)
async def get_category(
    session: AsyncSessionDep,
    category_id: PositiveInt,
    include: Annotated[
        set[str] | None,
        Query(description="Relationships to include", openapi_examples=CATEGORY_INCLUDE_EXAMPLES),
    ] = None,
) -> Category:
    """Get category by ID with specified relationships."""
    return await get_model_by_id(
        session,
        Category,
        category_id,
        include_relationships=include,
        read_schema=CategoryReadWithRelationshipsAndFlatSubCategories,
    )


@router.get(
    "{category_id}/subcategories",
    response_model=Page[CategoryReadWithRelationshipsAndFlatSubCategories],
    summary="Get category subcategories with optional filtering and relationships",
)
async def get_subcategories(
    category_id: Annotated[PositiveInt, Path(description="Category ID")],
    category_filter: CategoryFilterDep,
    session: AsyncSessionDep,
    include: Annotated[
        set[str] | None,
        Query(description="Relationships to include", openapi_examples=CATEGORY_INCLUDE_EXAMPLES),
    ] = None,
) -> Page[Category]:
    """Get paginated subcategories of a category with specified relationships."""
    await get_model_by_id(session, Category, category_id)
    statement = select(Category).where(Category.supercategory_id == category_id)
    return await get_paginated_models(
        session,
        Category,
        include_relationships=include,
        model_filter=category_filter,
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
    categories: Sequence[Category] = await crud.get_category_trees(
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
    summary="Get subcategory by ID",
)
async def get_subcategory(
    category_id: PositiveInt,
    subcategory_id: PositiveInt,
    session: AsyncSessionDep,
    include: Annotated[
        set[str] | None,
        Query(description="Relationships to include", openapi_examples=CATEGORY_INCLUDE_EXAMPLES),
    ] = None,
) -> Category:
    """Get subcategory by ID with specified relationships."""
    return await get_nested_model_by_id(
        session,
        Category,
        category_id,
        Category,
        subcategory_id,
        "supercategory_id",
        include_relationships=include,
        read_schema=CategoryReadWithRelationshipsAndFlatSubCategories,
    )
