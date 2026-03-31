"""Public material routers for background data."""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated

from fastapi import Path, Query
from fastapi_filter import FilterDepends
from fastapi_pagination import Page
from pydantic import UUID4, PositiveInt

from app.api.background_data import crud
from app.api.background_data.dependencies import CategoryFilterDep, MaterialFilterWithRelationshipsDep
from app.api.background_data.examples import (
    BACKGROUND_DATA_RESOURCE_INCLUDE_OPENAPI_EXAMPLES,
    TAXONOMY_CATEGORY_INCLUDE_OPENAPI_EXAMPLES,
)
from app.api.background_data.models import Category, CategoryMaterialLink, Material
from app.api.background_data.routers.public_support import BackgroundDataAPIRouter
from app.api.background_data.schemas import CategoryRead, MaterialReadWithRelationships
from app.api.common.crud.associations import get_linked_model_by_id, get_linked_models
from app.api.common.crud.base import get_model_by_id, get_paginated_models
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.file_storage.filters import FileFilter, ImageFilter
from app.api.file_storage.schemas import FileReadWithinParent, ImageReadWithinParent

if TYPE_CHECKING:
    from collections.abc import Sequence

router = BackgroundDataAPIRouter(prefix="/materials", tags=["materials"])


@router.get(
    "",
    response_model=Page[MaterialReadWithRelationships],
    summary="Get all materials with optional relationships",
)
async def get_materials(
    session: AsyncSessionDep,
    material_filter: MaterialFilterWithRelationshipsDep,
    include: Annotated[
        set[str] | None,
        Query(
            description="Relationships to include",
            openapi_examples=BACKGROUND_DATA_RESOURCE_INCLUDE_OPENAPI_EXAMPLES,
        ),
    ] = None,
) -> Page[Material]:
    """Get all materials with specified relationships."""
    return await get_paginated_models(
        session,
        Material,
        include_relationships=include,
        model_filter=material_filter,
        read_schema=MaterialReadWithRelationships,
    )


@router.get(
    "/{material_id}",
    response_model=MaterialReadWithRelationships,
)
async def get_material(
    session: AsyncSessionDep,
    material_id: PositiveInt,
    include: Annotated[
        set[str] | None,
        Query(
            description="Relationships to include",
            openapi_examples=BACKGROUND_DATA_RESOURCE_INCLUDE_OPENAPI_EXAMPLES,
        ),
    ] = None,
) -> Material:
    """Get material by ID with specified relationships."""
    return await get_model_by_id(
        session,
        Material,
        model_id=material_id,
        include_relationships=include,
        read_schema=MaterialReadWithRelationships,
    )


@router.get(
    "/{material_id}/categories",
    response_model=list[CategoryRead],
    summary="View categories of material",
)
async def get_material_categories(
    material_id: PositiveInt,
    session: AsyncSessionDep,
    category_filter: CategoryFilterDep,
    include: Annotated[
        set[str] | None,
        Query(description="Relationships to include", openapi_examples=TAXONOMY_CATEGORY_INCLUDE_OPENAPI_EXAMPLES),
    ] = None,
) -> Sequence[Category]:
    """Get categories linked to a material."""
    return await get_linked_models(
        session,
        Material,
        material_id,
        Category,
        CategoryMaterialLink,
        "material_id",
        include_relationships=include,
        model_filter=category_filter,
        read_schema=CategoryRead,
    )


@router.get(
    "/{material_id}/categories/{category_id}",
    response_model=CategoryRead,
    summary="Get category by ID",
)
async def get_material_category(
    material_id: PositiveInt,
    category_id: PositiveInt,
    session: AsyncSessionDep,
    include: Annotated[
        set[str] | None,
        Query(description="Relationships to include", openapi_examples=TAXONOMY_CATEGORY_INCLUDE_OPENAPI_EXAMPLES),
    ] = None,
) -> Category:
    """Get a material category by ID."""
    return await get_linked_model_by_id(
        session,
        Material,
        material_id,
        Category,
        category_id,
        CategoryMaterialLink,
        "material_id",
        "category_id",
        include=include,
        read_schema=CategoryRead,
    )


@router.get(
    "/{material_id}/files",
    response_model=list[FileReadWithinParent],
    summary="Get Material Files",
)
async def get_material_files(
    material_id: Annotated[PositiveInt, Path(description="ID of the Material")],
    session: AsyncSessionDep,
    item_filter: FileFilter = FilterDepends(FileFilter),
) -> list[FileReadWithinParent]:
    """Get all files associated with a material."""
    items = await crud.material_files_crud.get_all(session, material_id, filter_params=item_filter)
    return [FileReadWithinParent.model_validate(item) for item in items]


@router.get(
    "/{material_id}/files/{file_id}",
    response_model=FileReadWithinParent,
    summary="Get specific Material File",
)
async def get_material_file(
    material_id: Annotated[PositiveInt, Path(description="ID of the Material")],
    file_id: Annotated[UUID4, Path(description="ID of the file")],
    session: AsyncSessionDep,
) -> FileReadWithinParent:
    """Get a specific file associated with a material."""
    item = await crud.material_files_crud.get_by_id(session, material_id, file_id)
    return FileReadWithinParent.model_validate(item)


@router.get(
    "/{material_id}/images",
    response_model=list[ImageReadWithinParent],
    summary="Get Material Images",
)
async def get_material_images(
    material_id: Annotated[PositiveInt, Path(description="ID of the Material")],
    session: AsyncSessionDep,
    item_filter: ImageFilter = FilterDepends(ImageFilter),
) -> list[ImageReadWithinParent]:
    """Get all images associated with a material."""
    items = await crud.material_images_crud.get_all(session, material_id, filter_params=item_filter)
    return [ImageReadWithinParent.model_validate(item) for item in items]


@router.get(
    "/{material_id}/images/{image_id}",
    response_model=ImageReadWithinParent,
    summary="Get specific Material Image",
)
async def get_material_image(
    material_id: Annotated[PositiveInt, Path(description="ID of the Material")],
    image_id: Annotated[UUID4, Path(description="ID of the image")],
    session: AsyncSessionDep,
) -> ImageReadWithinParent:
    """Get a specific image associated with a material."""
    item = await crud.material_images_crud.get_by_id(session, material_id, image_id)
    return ImageReadWithinParent.model_validate(item)
