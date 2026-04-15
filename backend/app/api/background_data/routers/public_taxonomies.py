"""Public taxonomy routers for background data."""

from __future__ import annotations

from typing import TYPE_CHECKING, cast

from fastapi import Depends
from fastapi_pagination import Page, Params, create_page
from pydantic import PositiveInt
from sqlalchemy import select

from app.api.background_data.crud.categories import get_category_trees
from app.api.background_data.dependencies import CategoryFilterDep, TaxonomyFilterDep
from app.api.background_data.models import Category, Taxonomy
from app.api.background_data.routers.public_support import (
    BackgroundDataAPIRouter,
    RecursionDepthQueryParam,
    convert_subcategories_to_read_model,
)
from app.api.background_data.schemas import CategoryRead, CategoryReadWithRecursiveSubCategories, TaxonomyRead
from app.api.common.crud.exceptions import DependentModelOwnershipError
from app.api.common.crud.loading import apply_loader_profile
from app.api.common.crud.query import page_models, require_model
from app.api.common.routers.dependencies import AsyncSessionDep

if TYPE_CHECKING:
    from collections.abc import Sequence

router = BackgroundDataAPIRouter(prefix="/taxonomies", tags=["taxonomies"])


async def _require_taxonomy(session: AsyncSessionDep, taxonomy_id: PositiveInt) -> Taxonomy:
    """Load one taxonomy with the public read schema."""
    return await require_model(session, Taxonomy, taxonomy_id, read_schema=TaxonomyRead)


async def _get_taxonomy_category(
    session: AsyncSessionDep,
    *,
    taxonomy_id: PositiveInt,
    category_id: PositiveInt,
) -> Category:
    """Load one category scoped to a taxonomy."""
    statement = select(Category).where(Category.id == category_id, Category.taxonomy_id == taxonomy_id)
    statement = apply_loader_profile(statement, Category, read_schema=CategoryRead)
    scoped = (await session.execute(statement)).scalars().unique().one_or_none()
    if scoped is not None:
        return scoped

    category = await require_model(session, Category, category_id)
    if category.taxonomy_id != taxonomy_id:
        raise DependentModelOwnershipError(Category, category_id, Taxonomy, taxonomy_id)
    raise DependentModelOwnershipError(Category, category_id, Taxonomy, taxonomy_id)


async def _page_taxonomy_categories(
    session: AsyncSessionDep,
    *,
    taxonomy_id: PositiveInt,
    category_filter: CategoryFilterDep,
) -> Page[CategoryRead]:
    """Page categories scoped to one taxonomy."""
    statement = select(Category).where(Category.taxonomy_id == taxonomy_id)
    return await page_models(
        session,
        Category,
        filters=category_filter,
        statement=statement,
        read_schema=CategoryRead,
    )


@router.get("", response_model=Page[TaxonomyRead])
async def get_taxonomies(taxonomy_filter: TaxonomyFilterDep, session: AsyncSessionDep) -> Page[TaxonomyRead]:
    """Get all taxonomies with optional filtering."""
    page = await page_models(session, Taxonomy, filters=taxonomy_filter, read_schema=TaxonomyRead)
    return cast("Page[TaxonomyRead]", page)


@router.get("/{taxonomy_id}", response_model=TaxonomyRead)
async def get_taxonomy(taxonomy_id: PositiveInt, session: AsyncSessionDep) -> TaxonomyRead:
    """Get taxonomy by ID."""
    taxonomy = await _require_taxonomy(session, taxonomy_id)
    return TaxonomyRead.model_validate(taxonomy)


@router.get(
    "/{taxonomy_id}/categories/tree",
    response_model=Page[CategoryReadWithRecursiveSubCategories],
    summary="Get the category tree of a taxonomy",
)
async def get_taxonomy_category_tree(
    taxonomy_id: PositiveInt,
    session: AsyncSessionDep,
    category_filter: CategoryFilterDep,
    params: Params = Depends(),
    recursion_depth: RecursionDepthQueryParam = 1,
) -> Page[CategoryReadWithRecursiveSubCategories]:
    """Get paginated top-level categories of a taxonomy with their recursive subcategory trees."""
    categories: Sequence[Category] = await get_category_trees(
        session,
        recursion_depth,
        taxonomy_id=taxonomy_id,
        category_filter=category_filter,
    )
    tree_items = [
        CategoryReadWithRecursiveSubCategories.model_validate(category).model_copy(
            update={
                "subcategories": convert_subcategories_to_read_model(
                    category.subcategories or [], max_depth=recursion_depth - 1
                )
            }
        )
        for category in categories
    ]
    return cast(
        "Page[CategoryReadWithRecursiveSubCategories]",
        create_page(tree_items, total=len(tree_items), params=params),
    )


@router.get(
    "/{taxonomy_id}/categories",
    response_model=Page[CategoryRead],
    summary="View categories of taxonomy",
)
async def get_taxonomy_categories(
    taxonomy_id: PositiveInt,
    session: AsyncSessionDep,
    category_filter: CategoryFilterDep,
) -> Page[CategoryRead]:
    """Get taxonomy categories with optional filtering."""
    await _require_taxonomy(session, taxonomy_id)
    return await _page_taxonomy_categories(session, taxonomy_id=taxonomy_id, category_filter=category_filter)


@router.get(
    "/{taxonomy_id}/categories/{category_id}",
    response_model=CategoryRead,
    summary="Get category by ID",
)
async def get_taxonomy_category_by_id(
    taxonomy_id: PositiveInt,
    category_id: PositiveInt,
    session: AsyncSessionDep,
) -> Category:
    """Get a taxonomy category by ID."""
    return await _get_taxonomy_category(session, taxonomy_id=taxonomy_id, category_id=category_id)
