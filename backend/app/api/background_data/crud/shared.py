"""Shared helpers for background-data CRUD operations."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast

from sqlalchemy import select

from app.api.background_data.models import (
    Category,
    CategoryMaterialLink,
    CategoryProductTypeLink,
    Material,
    ProductType,
    Taxonomy,
)
from app.api.common.crud.associations import create_model_links
from app.api.common.crud.base import get_model_by_id
from app.api.common.crud.persistence import SupportsModelDump, delete_and_commit, update_and_commit
from app.api.common.crud.utils import (
    get_model_or_404,
    get_models_by_ids_or_404,
    validate_linked_items_exist,
    validate_no_duplicate_linked_items,
)

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable, Sequence

    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.background_data.models import TaxonomyDomain

    type ValidateCategoryDomainsFn = Callable[
        [AsyncSession, set[int], TaxonomyDomain | set[TaxonomyDomain]],
        Awaitable[None],
    ]


def normalize_category_ids(category_ids: int | set[int]) -> set[int]:
    """Normalize single category IDs into a set-based API."""
    return {category_ids} if isinstance(category_ids, int) else category_ids


async def create_background_model[ModelT: Taxonomy | Material | ProductType](
    db: AsyncSession,
    model: type[ModelT],
    payload: SupportsModelDump,
    *,
    exclude_fields: set[str],
) -> ModelT:
    """Create and flush a background-data model from a request payload."""
    model_data = cast("dict[str, Any]", payload.model_dump(exclude=exclude_fields))
    db_model = model(**model_data)
    db.add(db_model)
    await db.flush()
    return db_model


async def update_background_model[ModelT: Taxonomy | Material | ProductType | Category](
    db: AsyncSession,
    model: type[ModelT],
    model_id: int,
    payload: SupportsModelDump,
) -> ModelT:
    """Apply a partial update and persist the model."""
    db_model: ModelT = await get_model_or_404(db, model, model_id)
    return await update_and_commit(db, db_model, payload)


async def delete_background_model[ModelT: Taxonomy | Material | ProductType | Category](
    db: AsyncSession,
    model: type[ModelT],
    model_id: int,
) -> ModelT:
    """Delete a model after resolving it from the database."""
    db_model: ModelT = await get_model_or_404(db, model, model_id)
    await delete_and_commit(db, db_model)
    return db_model


async def add_categories_to_parent_model[ParentT: Material | ProductType](
    db: AsyncSession,
    *,
    parent_model: type[ParentT],
    parent_id: int,
    category_ids: int | set[int],
    expected_domains: set[TaxonomyDomain],
    link_model: type[CategoryMaterialLink | CategoryProductTypeLink],
    link_parent_id_field: str,
    validate_category_taxonomy_domains: ValidateCategoryDomainsFn,
) -> tuple[ParentT, Sequence[Category]]:
    """Create validated category links for a material-like parent model."""
    normalized_category_ids = normalize_category_ids(category_ids)

    db_parent = await get_model_by_id(
        db,
        parent_model,
        model_id=parent_id,
        include_relationships={"categories"},
    )

    db_categories: Sequence[Category] = await get_models_by_ids_or_404(db, Category, normalized_category_ids)
    await validate_category_taxonomy_domains(db, normalized_category_ids, expected_domains)

    if db_parent.categories:
        validate_no_duplicate_linked_items(normalized_category_ids, db_parent.categories, "Categories")

    await create_model_links(
        db,
        id1=cast("int", db_parent.id),
        id1_field=link_parent_id_field,
        id2_set=normalized_category_ids,
        id2_field="category_id",
        link_model=link_model,
    )

    return db_parent, db_categories


async def remove_categories_from_parent_model[ParentT: Material | ProductType](
    db: AsyncSession,
    *,
    parent_model: type[ParentT],
    parent_id: int,
    category_ids: int | set[int],
    link_model: type[CategoryMaterialLink | CategoryProductTypeLink],
    link_parent_id_field: str,
) -> None:
    """Remove validated category links from a material-like parent model."""
    normalized_category_ids = normalize_category_ids(category_ids)

    db_parent = await get_model_by_id(
        db,
        parent_model,
        model_id=parent_id,
        include_relationships={"categories"},
    )

    validate_linked_items_exist(normalized_category_ids, db_parent.categories, "Categories")

    statement = (
        select(link_model)
        .where(getattr(link_model, link_parent_id_field) == parent_id)
        .where(link_model.category_id.in_(normalized_category_ids))
    )
    results = await db.execute(statement)
    for category_link in results.scalars().all():
        await db.delete(category_link)
