"""Public material routers for background data."""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated, cast

from fastapi import Path, Request
from fastapi_filter import FilterDepends
from fastapi_pagination import Page
from pydantic import UUID4, PositiveInt
from sqlalchemy import Select, select

from app.api.background_data.crud.materials import (
    get_material_file as load_material_file,
)
from app.api.background_data.crud.materials import (
    get_material_image as load_material_image,
)
from app.api.background_data.crud.materials import (
    list_material_files,
    list_material_images,
)
from app.api.background_data.dependencies import CategoryFilterDep, MaterialFilterWithRelationshipsDep
from app.api.background_data.models import Category, CategoryMaterialLink, Material
from app.api.background_data.routers.public_support import BackgroundDataAPIRouter
from app.api.background_data.schemas import CategoryRead, MaterialReadWithRelationships
from app.api.common.crud.loading import apply_loader_profile
from app.api.common.crud.query import page_models, require_model
from app.api.common.exceptions import BadRequestError
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.file_storage.filters import FileFilter, ImageFilter
from app.api.file_storage.schemas import FileReadWithinParent, ImageReadWithinParent
from app.core.responses import conditional_json_response

if TYPE_CHECKING:
    from collections.abc import Sequence

    from starlette.responses import Response

router = BackgroundDataAPIRouter(prefix="/materials", tags=["materials"])


async def _require_material(session: AsyncSessionDep, material_id: PositiveInt) -> Material:
    """Load a material with the standard public relationships."""
    return await require_model(
        session,
        Material,
        model_id=material_id,
        loaders={"categories", "images", "files"},
        read_schema=MaterialReadWithRelationships,
    )


async def _get_linked_material_category(
    session: AsyncSessionDep,
    *,
    material_id: PositiveInt,
    category_id: PositiveInt,
) -> Category:
    """Load one category linked to a material."""
    await require_model(session, Material, material_id)
    statement = (
        select(Category)
        .join(CategoryMaterialLink, Category.id == CategoryMaterialLink.category_id)
        .where(CategoryMaterialLink.material_id == material_id, Category.id == category_id)
    )
    statement = apply_loader_profile(statement, Category, read_schema=CategoryRead)
    category = (await session.execute(statement)).scalars().unique().one_or_none()
    if category is None:
        msg = "Category is not linked to Material"
        raise BadRequestError(msg)
    return category


async def _list_material_categories(
    session: AsyncSessionDep,
    *,
    material_id: PositiveInt,
    category_filter: CategoryFilterDep,
) -> Sequence[Category]:
    """List categories linked to a material."""
    await require_model(session, Material, material_id)
    statement: Select[tuple[Category]] = (
        select(Category)
        .join(CategoryMaterialLink, Category.id == CategoryMaterialLink.category_id)
        .where(CategoryMaterialLink.material_id == material_id)
    )
    statement = cast("Select[tuple[Category]]", category_filter.filter(statement))
    statement = cast(
        "Select[tuple[Category]]",
        apply_loader_profile(statement, Category, read_schema=CategoryRead),
    )
    return list((await session.execute(statement)).scalars().unique().all())


@router.get(
    "",
    response_model=Page[MaterialReadWithRelationships],
    summary="Get all materials with all relationships",
)
async def get_materials(
    request: Request,
    session: AsyncSessionDep,
    material_filter: MaterialFilterWithRelationshipsDep,
) -> Page[Material] | Response:
    """Get all materials with all relationships loaded."""
    payload = await page_models(
        session,
        Material,
        loaders={"categories", "images", "files"},
        filters=material_filter,
        read_schema=MaterialReadWithRelationships,
    )
    return conditional_json_response(request, payload)


@router.get(
    "/{material_id}",
    response_model=MaterialReadWithRelationships,
)
async def get_material(
    request: Request,
    session: AsyncSessionDep,
    material_id: PositiveInt,
) -> Material | Response:
    """Get material by ID with all relationships loaded."""
    payload = await _require_material(session, material_id)
    return conditional_json_response(request, payload)


@router.get(
    "/{material_id}/categories",
    response_model=list[CategoryRead],
    summary="View categories of material",
)
async def get_material_categories(
    material_id: PositiveInt,
    session: AsyncSessionDep,
    category_filter: CategoryFilterDep,
) -> Sequence[Category]:
    """Get categories linked to a material."""
    return await _list_material_categories(session, material_id=material_id, category_filter=category_filter)


@router.get(
    "/{material_id}/categories/{category_id}",
    response_model=CategoryRead,
    summary="Get category by ID",
)
async def get_material_category(
    material_id: PositiveInt,
    category_id: PositiveInt,
    session: AsyncSessionDep,
) -> Category:
    """Get a material category by ID."""
    return await _get_linked_material_category(session, material_id=material_id, category_id=category_id)


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
    items = await list_material_files(session, material_id, filter_params=item_filter)
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
    item = await load_material_file(session, material_id, file_id)
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
    items = await list_material_images(session, material_id, filter_params=item_filter)
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
    item = await load_material_image(session, material_id, image_id)
    return ImageReadWithinParent.model_validate(item)
