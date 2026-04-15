"""Product-type CRUD operations."""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.api.background_data.models import Category, CategoryProductTypeLink, ProductType, TaxonomyDomain
from app.api.background_data.schemas import ProductTypeCreate, ProductTypeCreateWithCategories, ProductTypeUpdate
from app.api.common.crud.associations import add_links
from app.api.common.crud.persistence import commit_and_refresh
from app.api.common.crud.query import require_model
from app.api.common.exceptions import InternalServerError
from app.api.file_storage.crud.parent_media import ParentMediaCrud
from app.api.file_storage.crud.support_services import file_storage_service, image_storage_service
from app.api.file_storage.models import File, Image, MediaParentType

from .categories import validate_category_taxonomy_domains
from .shared import (
    add_categories_to_parent_model,
    create_background_model,
    remove_categories_from_parent_model,
    update_background_model,
)

if TYPE_CHECKING:
    from collections.abc import Sequence

    from pydantic import UUID4
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.file_storage.filters import FileFilter, ImageFilter
    from app.api.file_storage.schemas import FileCreate, ImageCreateFromForm


async def create_product_type(
    db: AsyncSession, product_type: ProductTypeCreate | ProductTypeCreateWithCategories
) -> ProductType:
    """Create a new product type in the database, optionally with category links."""
    db_product_type = await create_background_model(db, ProductType, product_type, exclude_fields={"category_ids"})

    if isinstance(product_type, ProductTypeCreateWithCategories) and product_type.category_ids:
        await validate_category_taxonomy_domains(db, product_type.category_ids, {TaxonomyDomain.PRODUCTS})
        await add_links(
            db,
            id1=db_product_type.id,
            id1_attr=CategoryProductTypeLink.product_type_id,
            id2_set=product_type.category_ids,
            id2_attr=CategoryProductTypeLink.category_id,
            link_model=CategoryProductTypeLink,
        )
        return await commit_and_refresh(db, db_product_type, add_before_commit=False)

    return await commit_and_refresh(db, db_product_type, add_before_commit=False)


async def update_product_type(db: AsyncSession, product_type_id: int, product_type: ProductTypeUpdate) -> ProductType:
    """Update an existing product type in the database."""
    return await update_background_model(db, ProductType, product_type_id, product_type)


async def delete_product_type(db: AsyncSession, product_type_id: int) -> None:
    """Delete a product type from the database."""
    db_product_type = await require_model(db, ProductType, product_type_id)

    await delete_all_product_type_files(db, product_type_id)
    await delete_all_product_type_images(db, product_type_id)

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


_product_type_files = ParentMediaCrud(
    parent_model=ProductType,
    parent_type=MediaParentType.PRODUCT_TYPE,
    storage_model=File,
    storage_service=file_storage_service,
)

_product_type_images = ParentMediaCrud(
    parent_model=ProductType,
    parent_type=MediaParentType.PRODUCT_TYPE,
    storage_model=Image,
    storage_service=image_storage_service,
)


async def list_product_type_files(
    db: AsyncSession, product_type_id: int, *, filter_params: FileFilter
) -> Sequence[File]:
    """List files attached to a product type."""
    return await _product_type_files.get_all(db, product_type_id, filter_params=filter_params)


async def get_product_type_file(db: AsyncSession, product_type_id: int, file_id: UUID4) -> File:
    """Load one file attached to a product type."""
    return await _product_type_files.get_by_id(db, product_type_id, file_id)


async def create_product_type_file(db: AsyncSession, product_type_id: int, payload: FileCreate) -> File:
    """Create a file attached to a product type."""
    return await _product_type_files.create(db, product_type_id, payload)


async def delete_product_type_file(db: AsyncSession, product_type_id: int, file_id: UUID4) -> None:
    """Delete a file attached to a product type."""
    await _product_type_files.delete(db, product_type_id, file_id)


async def delete_all_product_type_files(db: AsyncSession, product_type_id: int) -> None:
    """Delete all files attached to a product type."""
    await _product_type_files.delete_all(db, product_type_id)


async def list_product_type_images(
    db: AsyncSession, product_type_id: int, *, filter_params: ImageFilter
) -> Sequence[Image]:
    """List images attached to a product type."""
    return await _product_type_images.get_all(db, product_type_id, filter_params=filter_params)


async def get_product_type_image(db: AsyncSession, product_type_id: int, image_id: UUID4) -> Image:
    """Load one image attached to a product type."""
    return await _product_type_images.get_by_id(db, product_type_id, image_id)


async def create_product_type_image(
    db: AsyncSession, product_type_id: int, payload: ImageCreateFromForm
) -> Image:
    """Create an image attached to a product type."""
    return await _product_type_images.create(db, product_type_id, payload)


async def delete_product_type_image(db: AsyncSession, product_type_id: int, image_id: UUID4) -> None:
    """Delete an image attached to a product type."""
    await _product_type_images.delete(db, product_type_id, image_id)


async def delete_all_product_type_images(db: AsyncSession, product_type_id: int) -> None:
    """Delete all images attached to a product type."""
    await _product_type_images.delete_all(db, product_type_id)
