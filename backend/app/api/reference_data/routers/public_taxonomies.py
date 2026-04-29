"""Public taxonomy routers for reference data."""

from __future__ import annotations

from typing import TYPE_CHECKING, cast

from fastapi import Depends
from fastapi_pagination import Page, Params, create_page
from pydantic import PositiveInt
from sqlalchemy import select

from app.api.common.crud.filtering import apply_filter
from app.api.common.crud.loading import apply_loader_profile
from app.api.common.crud.pagination import paginate_select
from app.api.common.crud.query import require_model
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.reference_data.crud.categories import get_category_trees
from app.api.reference_data.dependencies import CategoryFilterDep, TaxonomyFilterDep
from app.api.reference_data.models import Category, Taxonomy
from app.api.reference_data.routers.public_support import (
    RecursionDepthQueryParam,
    ReferenceDataAPIRouter,
    convert_categories_to_tree,
)
from app.api.reference_data.schemas import CategoryRead, CategoryReadWithRecursiveSubCategories, TaxonomyRead

if TYPE_CHECKING:
    from collections.abc import Sequence

    from sqlalchemy import Select

router = ReferenceDataAPIRouter(prefix="/taxonomies", tags=["taxonomies"])


async def _require_taxonomy(session: AsyncSessionDep, taxonomy_id: PositiveInt) -> Taxonomy:
    """Load one taxonomy with the public read schema."""
    return await require_model(session, Taxonomy, taxonomy_id, read_schema=TaxonomyRead)


async def _page_taxonomy_categories(
    session: AsyncSessionDep,
    *,
    taxonomy_id: PositiveInt,
    category_filter: CategoryFilterDep,
) -> Page[Category]:
    """Page categories scoped to one taxonomy (serialized via ``CategoryRead`` by FastAPI)."""
    statement: Select[tuple[Category]] = select(Category).where(Category.taxonomy_id == taxonomy_id)
    statement = apply_filter(statement, Category, category_filter)
    statement = apply_loader_profile(statement, Category, read_schema=CategoryRead)
    return await paginate_select(session, statement, model=Category)


async def _page_taxonomies(
    session: AsyncSessionDep,
    *,
    taxonomy_filter: TaxonomyFilterDep,
) -> Page[Taxonomy]:
    """Page public taxonomies from an explicit taxonomy query (serialized via ``TaxonomyRead``)."""
    statement: Select[tuple[Taxonomy]] = select(Taxonomy)
    statement = apply_filter(statement, Taxonomy, taxonomy_filter)
    statement = apply_loader_profile(statement, Taxonomy, read_schema=TaxonomyRead)
    return await paginate_select(session, statement, model=Taxonomy)


@router.get("", response_model=Page[TaxonomyRead])
async def get_taxonomies(taxonomy_filter: TaxonomyFilterDep, session: AsyncSessionDep) -> Page[Taxonomy]:
    """Get all taxonomies with optional filtering."""
    return await _page_taxonomies(session, taxonomy_filter=taxonomy_filter)


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
    tree_items = convert_categories_to_tree(list(categories), recursion_depth=recursion_depth)
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
) -> Page[Category]:
    """Get taxonomy categories with optional filtering."""
    await _require_taxonomy(session, taxonomy_id)
    return await _page_taxonomy_categories(session, taxonomy_id=taxonomy_id, category_filter=category_filter)
