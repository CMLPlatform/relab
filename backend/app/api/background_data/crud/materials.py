"""Material CRUD operations."""

from __future__ import annotations

from typing import TYPE_CHECKING, cast

from app.api.background_data.models import Category, CategoryMaterialLink, Material, TaxonomyDomain
from app.api.background_data.schemas import MaterialCreate, MaterialCreateWithCategories, MaterialUpdate
from app.api.common.crud.associations import create_model_links
from app.api.common.crud.persistence import commit_and_refresh
from app.api.common.exceptions import InternalServerError
from app.api.file_storage.crud import ParentFileCrud, ParentImageCrud
from app.api.file_storage.filters import FileFilter, ImageFilter
from app.api.file_storage.models import File, Image, MediaParentType
from app.api.file_storage.schemas import FileCreate, ImageCreateFromForm

from .categories import validate_category_taxonomy_domains
from .shared import (
    add_categories_to_parent_model,
    create_background_model,
    get_model_or_404,
    get_models_by_ids_or_404,
    remove_categories_from_parent_model,
    update_background_model,
)

if TYPE_CHECKING:
    from collections.abc import Sequence

    from sqlmodel.ext.asyncio.session import AsyncSession


async def create_material(db: AsyncSession, material: MaterialCreate | MaterialCreateWithCategories) -> Material:
    """Create a new material in the database, optionally with category links."""
    db_material = await create_background_model(db, Material, material, exclude_fields={"category_ids"})

    if isinstance(material, MaterialCreateWithCategories) and material.category_ids:
        await get_models_by_ids_or_404(db, Category, material.category_ids)
        await validate_category_taxonomy_domains(db, material.category_ids, {TaxonomyDomain.MATERIALS})

        await create_model_links(
            db,
            id1=cast("int", db_material.id),
            id1_field="material_id",
            id2_set=material.category_ids,
            id2_field="category_id",
            link_model=CategoryMaterialLink,
        )

    return await commit_and_refresh(db, db_material, add_before_commit=False)


async def update_material(db: AsyncSession, material_id: int, material: MaterialUpdate) -> Material:
    """Update an existing material in the database."""
    return await update_background_model(db, Material, material_id, material)


async def delete_material(db: AsyncSession, material_id: int) -> None:
    """Delete a material from the database."""
    db_material = await get_model_or_404(db, Material, material_id)

    await material_files_crud.delete_all(db, material_id)
    await material_images_crud.delete_all(db, material_id)

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


material_files_crud = ParentFileCrud(
    parent_model=Material,
    parent_type=MediaParentType.MATERIAL,
    parent_field="material_id",
)

material_images_crud = ParentImageCrud(
    parent_model=Material,
    parent_type=MediaParentType.MATERIAL,
    parent_field="material_id",
)
