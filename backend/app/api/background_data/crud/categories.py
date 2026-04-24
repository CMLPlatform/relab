"""Category CRUD operations."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.background_data.filters import CategoryFilter, CategoryFilterWithRelationships
from app.api.background_data.models import Category, Taxonomy, TaxonomyDomain
from app.api.background_data.schemas import (
    CategoryCreateWithinCategoryWithSubCategories,
    CategoryCreateWithinTaxonomyWithSubCategories,
    CategoryCreateWithSubCategories,
    CategoryUpdate,
)
from app.api.common.crud.filtering import apply_filter
from app.api.common.crud.query import require_model
from app.api.common.crud.utils import enum_format_id_set, format_id_set
from app.api.common.exceptions import BadRequestError
from app.api.common.sa_typing import orm_attr

from .shared import delete_background_model, update_background_model

if TYPE_CHECKING:
    from sqlalchemy import Select
    from sqlalchemy.ext.asyncio import AsyncSession


async def validate_category_creation(
    db: AsyncSession,
    category: CategoryCreateWithSubCategories
    | CategoryCreateWithinCategoryWithSubCategories
    | CategoryCreateWithinTaxonomyWithSubCategories,
    taxonomy_id: int | None = None,
    supercategory_id: int | None = None,
) -> tuple[int, Category | None]:
    """Validate category creation parameters and return taxonomy_id and supercategory."""
    if supercategory_id:
        supercategory: Category = await require_model(db, Category, supercategory_id)

        taxonomy_id = taxonomy_id or supercategory.taxonomy_id
        if supercategory.taxonomy_id != taxonomy_id:
            err_msg = f"Supercategory with id {supercategory_id} does not belong to taxonomy with id {taxonomy_id}"
            raise BadRequestError(err_msg)
        return taxonomy_id, supercategory

    taxonomy_id = taxonomy_id or getattr(category, "taxonomy_id", None)

    if not taxonomy_id:
        err_msg = "Taxonomy ID is required for top-level categories"
        raise BadRequestError(err_msg)

    await require_model(db, Taxonomy, taxonomy_id)

    return taxonomy_id, None


async def validate_category_taxonomy_domains(
    db: AsyncSession, category_ids: set[int], expected_domains: TaxonomyDomain | set[TaxonomyDomain]
) -> None:
    """Validate that categories belong to taxonomies with expected domains."""
    categories_statement: Select[tuple[Category]] = (
        select(Category)
        .join(Taxonomy)
        .where(Category.id.in_(category_ids))
        .options(selectinload(orm_attr(Category.taxonomy)))
    )
    categories = list((await db.execute(categories_statement)).scalars().all())

    if len(categories) != len(category_ids):
        missing = set(category_ids) - {c.id for c in categories}
        err_msg = f"Categories with id {format_id_set(missing)} not found"
        raise BadRequestError(err_msg)

    if isinstance(expected_domains, TaxonomyDomain):
        expected_domains = {expected_domains}

    invalid = {c.id for c in categories if not (set(c.taxonomy.domains) & expected_domains)}
    if invalid:
        err_msg = (
            f"Categories with id {format_id_set(invalid)} belong to taxonomies "
            f"outside of domains: {enum_format_id_set(expected_domains)}"
        )
        raise BadRequestError(err_msg)


async def get_category_trees(
    db: AsyncSession,
    recursion_depth: int = 1,
    *,
    supercategory_id: int | None = None,
    taxonomy_id: int | None = None,
    category_filter: CategoryFilter | CategoryFilterWithRelationships | None = None,
) -> list[Category]:
    """Get categories with their subcategories up to specified depth."""
    if supercategory_id and taxonomy_id:
        err_msg = "Provide either supercategory_id or taxonomy_id, not both"
        raise BadRequestError(err_msg)

    if supercategory_id:
        await require_model(db, Category, supercategory_id)

    if taxonomy_id:
        await require_model(db, Taxonomy, taxonomy_id)

    statement: Select[tuple[Category]] = (
        select(Category).where(Category.supercategory_id == supercategory_id).execution_options(populate_existing=True)
    )

    if taxonomy_id:
        statement = statement.where(Category.taxonomy_id == taxonomy_id)

    statement = apply_filter(statement, Category, category_filter)

    statement = statement.options(
        selectinload(orm_attr(Category.subcategories), recursion_depth=recursion_depth)
    )

    return list((await db.execute(statement)).scalars().all())


async def create_category(
    db: AsyncSession,
    category: CategoryCreateWithSubCategories
    | CategoryCreateWithinCategoryWithSubCategories
    | CategoryCreateWithinTaxonomyWithSubCategories,
    taxonomy_id: int | None = None,
    supercategory_id: int | None = None,
    *,
    _is_recursive_call: bool = False,
) -> Category:
    """Create a new category in the database and handle subcategory categories recursively."""
    taxonomy_id, supercategory = await validate_category_creation(
        db,
        category,
        taxonomy_id,
        supercategory_id
        if isinstance(category, CategoryCreateWithinCategoryWithSubCategories)
        else category.supercategory_id,
    )

    db_category = Category(
        name=category.name,
        description=category.description,
        taxonomy_id=taxonomy_id,
        supercategory_id=supercategory.id if supercategory else None,
    )
    db.add(db_category)
    await db.flush()

    if category.subcategories:
        for subcategory in category.subcategories:
            await create_category(
                db,
                subcategory,
                taxonomy_id=taxonomy_id,
                supercategory_id=db_category.id,
                _is_recursive_call=True,
            )

    if not _is_recursive_call:
        await db.commit()
        await db.refresh(db_category)

    return db_category


async def update_category(db: AsyncSession, category_id: int, category: CategoryUpdate) -> Category:
    """Update an existing category in the database."""
    return await update_background_model(db, Category, category_id, category)


async def delete_category(db: AsyncSession, category_id: int) -> None:
    """Delete a category from the database."""
    await delete_background_model(db, Category, category_id)
