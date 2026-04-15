"""Material CRUD operations."""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.api.background_data.models import Category, CategoryMaterialLink, Material, TaxonomyDomain
from app.api.background_data.schemas import MaterialCreate, MaterialCreateWithCategories, MaterialUpdate
from app.api.common.crud.associations import add_links
from app.api.common.crud.persistence import commit_and_refresh
from app.api.common.crud.query import require_model, require_models
from app.api.common.exceptions import InternalServerError
from app.api.file_storage.crud.parent_media import ParentMediaCrud
from app.api.file_storage.crud.support import file_storage_service, image_storage_service
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


async def create_material(db: AsyncSession, material: MaterialCreate | MaterialCreateWithCategories) -> Material:
    """Create a new material in the database, optionally with category links."""
    db_material = await create_background_model(db, Material, material, exclude_fields={"category_ids"})

    if isinstance(material, MaterialCreateWithCategories) and material.category_ids:
        await require_models(db, Category, material.category_ids)
        await validate_category_taxonomy_domains(db, material.category_ids, {TaxonomyDomain.MATERIALS})

        await add_links(
            db,
            id1=db_material.id,
            id1_attr=CategoryMaterialLink.material_id,
            id2_set=material.category_ids,
            id2_attr=CategoryMaterialLink.category_id,
            link_model=CategoryMaterialLink,
        )

    return await commit_and_refresh(db, db_material, add_before_commit=False)


async def update_material(db: AsyncSession, material_id: int, material: MaterialUpdate) -> Material:
    """Update an existing material in the database."""
    return await update_background_model(db, Material, material_id, material)


async def delete_material(db: AsyncSession, material_id: int) -> None:
    """Delete a material from the database."""
    db_material = await require_model(db, Material, material_id)

    await delete_all_material_files(db, material_id)
    await delete_all_material_images(db, material_id)

    await db.delete(db_material)
    await db.commit()


async def add_categories_to_material(
    db: AsyncSession, material_id: int, category_ids: int | set[int]
) -> Sequence[Category]:
    """Add categories to a material."""
    db_material, db_categories = await add_categories_to_parent_model(
        db,
        parent_model=Material,
        parent_id=material_id,
        category_ids=category_ids,
        expected_domains={TaxonomyDomain.MATERIALS},
        link_model=CategoryMaterialLink,
        link_parent_id_field="material_id",
        validate_category_taxonomy_domains=validate_category_taxonomy_domains,
    )

    await db.commit()
    await db.refresh(db_material)
    return db_categories


async def add_category_to_material(db: AsyncSession, material_id: int, category_id: int) -> Category:
    """Add a category to a material."""
    db_category_list = await add_categories_to_material(db, material_id, {category_id})

    if len(db_category_list) != 1:
        err_msg = f"Database integrity error: Expected 1 category with id {category_id}, got {len(db_category_list)}"
        raise InternalServerError(log_message=err_msg)

    return db_category_list[0]


async def remove_categories_from_material(db: AsyncSession, material_id: int, category_ids: int | set[int]) -> None:
    """Remove categories from a material."""
    await remove_categories_from_parent_model(
        db,
        parent_model=Material,
        parent_id=material_id,
        category_ids=category_ids,
        link_model=CategoryMaterialLink,
        link_parent_id_field="material_id",
    )
    await db.commit()


_material_files = ParentMediaCrud(
    parent_model=Material,
    parent_type=MediaParentType.MATERIAL,
    storage_model=File,
    storage_service=file_storage_service,
)

_material_images = ParentMediaCrud(
    parent_model=Material,
    parent_type=MediaParentType.MATERIAL,
    storage_model=Image,
    storage_service=image_storage_service,
)


async def list_material_files(db: AsyncSession, material_id: int, *, filter_params: FileFilter) -> Sequence[File]:
    """List files attached to a material."""
    return await _material_files.get_all(db, material_id, filter_params=filter_params)


async def get_material_file(db: AsyncSession, material_id: int, file_id: UUID4) -> File:
    """Load one file attached to a material."""
    return await _material_files.get_by_id(db, material_id, file_id)


async def create_material_file(db: AsyncSession, material_id: int, payload: FileCreate) -> File:
    """Create a file attached to a material."""
    return await _material_files.create(db, material_id, payload)


async def delete_material_file(db: AsyncSession, material_id: int, file_id: UUID4) -> None:
    """Delete a file attached to a material."""
    await _material_files.delete(db, material_id, file_id)


async def delete_all_material_files(db: AsyncSession, material_id: int) -> None:
    """Delete all files attached to a material."""
    await _material_files.delete_all(db, material_id)


async def list_material_images(db: AsyncSession, material_id: int, *, filter_params: ImageFilter) -> Sequence[Image]:
    """List images attached to a material."""
    return await _material_images.get_all(db, material_id, filter_params=filter_params)


async def get_material_image(db: AsyncSession, material_id: int, image_id: UUID4) -> Image:
    """Load one image attached to a material."""
    return await _material_images.get_by_id(db, material_id, image_id)


async def create_material_image(db: AsyncSession, material_id: int, payload: ImageCreateFromForm) -> Image:
    """Create an image attached to a material."""
    return await _material_images.create(db, material_id, payload)


async def delete_material_image(db: AsyncSession, material_id: int, image_id: UUID4) -> None:
    """Delete an image attached to a material."""
    await _material_images.delete(db, material_id, image_id)


async def delete_all_material_images(db: AsyncSession, material_id: int) -> None:
    """Delete all images attached to a material."""
    await _material_images.delete_all(db, material_id)
