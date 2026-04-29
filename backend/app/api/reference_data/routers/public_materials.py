"""Public material routers for reference data."""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated

from fastapi import Path, Request
from fastapi_filter import FilterDepends
from fastapi_pagination import Page
from pydantic import PositiveInt
from sqlalchemy import Select, select

from app.api.common.crud.filtering import apply_filter
from app.api.common.crud.loading import apply_loader_profile
from app.api.common.crud.pagination import paginate_select
from app.api.common.crud.query import require_model
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.file_storage.filters import FileFilter, ImageFilter
from app.api.file_storage.schemas import FileReadWithinParent, ImageReadWithinParent
from app.api.reference_data.crud.materials import (
    list_material_files,
    list_material_images,
)
from app.api.reference_data.dependencies import CategoryFilterDep, MaterialFilterWithRelationshipsDep
from app.api.reference_data.models import Category, CategoryMaterialLink, Material
from app.api.reference_data.routers.public_support import ReferenceDataAPIRouter
from app.api.reference_data.schemas import CategoryRead, MaterialReadWithRelationships
from app.core.responses import conditional_json_response

if TYPE_CHECKING:
    from collections.abc import Sequence

    from starlette.responses import Response

router = ReferenceDataAPIRouter(prefix="/materials", tags=["materials"])


async def _require_material(session: AsyncSessionDep, material_id: PositiveInt) -> Material:
    """Load a material with the standard public relationships."""
    return await require_model(
        session,
        Material,
        model_id=material_id,
        loaders={"categories", "images", "files"},
        read_schema=MaterialReadWithRelationships,
    )


async def _page_materials(
    session: AsyncSessionDep,
    *,
    material_filter: MaterialFilterWithRelationshipsDep,
) -> Page[Material]:
    """Page public materials from an explicit material query."""
    statement: Select[tuple[Material]] = select(Material)
    statement = apply_filter(statement, Material, material_filter)
    statement = apply_loader_profile(
        statement,
        Material,
        {"categories", "images", "files"},
        read_schema=MaterialReadWithRelationships,
    )
    return await paginate_select(session, statement, model=Material)


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
    statement = apply_filter(statement, Category, category_filter)
    statement = apply_loader_profile(statement, Category, read_schema=CategoryRead)
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
    payload = await _page_materials(session, material_filter=material_filter)
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
