"""Product-type CRUD operations."""

from __future__ import annotations

from typing import TYPE_CHECKING, cast

from app.api.background_data.models import Category, CategoryProductTypeLink, ProductType, TaxonomyDomain
from app.api.background_data.schemas import ProductTypeCreate, ProductTypeCreateWithCategories, ProductTypeUpdate
from app.api.common.crud.associations import create_model_links
from app.api.common.crud.persistence import commit_and_refresh
from app.api.common.exceptions import InternalServerError
from app.api.file_storage.crud import ParentFileCrud, ParentImageCrud
from app.api.file_storage.models import MediaParentType

from .categories import validate_category_taxonomy_domains
from .shared import (
    add_categories_to_parent_model,
    create_background_model,
    get_model_or_404,
    remove_categories_from_parent_model,
    update_background_model,
)

if TYPE_CHECKING:
    from collections.abc import Sequence

    from sqlalchemy.ext.asyncio import AsyncSession


async def create_product_type(
    db: AsyncSession, product_type: ProductTypeCreate | ProductTypeCreateWithCategories
) -> ProductType:
    """Create a new product type in the database, optionally with category links."""
    db_product_type = await create_background_model(db, ProductType, product_type, exclude_fields={"category_ids"})

    if isinstance(product_type, ProductTypeCreateWithCategories) and product_type.category_ids:
        await validate_category_taxonomy_domains(db, product_type.category_ids, {TaxonomyDomain.PRODUCTS})
        await create_model_links(
            db,
            id1=cast("int", db_product_type.id),
            id1_field="product_type_id",
            id2_set=product_type.category_ids,
            id2_field="category_id",
            link_model=CategoryProductTypeLink,
        )
        return await commit_and_refresh(db, db_product_type, add_before_commit=False)

    return await commit_and_refresh(db, db_product_type, add_before_commit=False)


async def update_product_type(db: AsyncSession, product_type_id: int, product_type: ProductTypeUpdate) -> ProductType:
    """Update an existing product type in the database."""
    return await update_background_model(db, ProductType, product_type_id, product_type)


async def delete_product_type(db: AsyncSession, product_type_id: int) -> None:
    """Delete a product type from the database."""
    db_product_type = await get_model_or_404(db, ProductType, product_type_id)

    await product_type_files_crud.delete_all(db, product_type_id)
    await product_type_images_crud.delete_all(db, product_type_id)

    await db.delete(db_product_type)
    await db.commit()


async def add_categories_to_product_type(
    db: AsyncSession, product_type_id: int, category_ids: set[int]
) -> Sequence[Category]:
    """Add categories to a product type."""
    _, db_categories = await add_categories_to_parent_model(
        db,
        parent_model=ProductType,
        parent_id=product_type_id,
        category_ids=category_ids,
        expected_domains={TaxonomyDomain.PRODUCTS},
        link_model=CategoryProductTypeLink,
        link_parent_id_field="product_type_id",
        validate_category_taxonomy_domains=validate_category_taxonomy_domains,
    )
    await db.commit()

    return db_categories


async def add_category_to_product_type(db: AsyncSession, product_type_id: int, category_id: int) -> Category:
    """Add a category to a product type."""
    db_category_list = await add_categories_to_product_type(db, product_type_id, {category_id})

    if len(db_category_list) != 1:
        err_msg = f"Database integrity error: Expected 1 category with id {category_id}, got {len(db_category_list)}"
        raise InternalServerError(log_message=err_msg)

    return db_category_list[0]


async def remove_categories_from_product_type(
    db: AsyncSession, product_type_id: int, category_ids: int | set[int]
) -> None:
    """Remove categories from a product type."""
    await remove_categories_from_parent_model(
        db,
        parent_model=ProductType,
        parent_id=product_type_id,
        category_ids=category_ids,
        link_model=CategoryProductTypeLink,
        link_parent_id_field="product_type_id",
    )
    await db.commit()


product_type_files_crud = ParentFileCrud(
    parent_model=ProductType,
    parent_type=MediaParentType.PRODUCT_TYPE,
    parent_field="product_type_id",
)

product_type_images_crud = ParentImageCrud(
    parent_model=ProductType,
    parent_type=MediaParentType.PRODUCT_TYPE,
    parent_field="product_type_id",
)
