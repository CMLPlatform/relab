"""Public material routers for reference data."""

from typing import Annotated

from fastapi import Depends, Path, Request
from fastapi_pagination import Page
from pydantic import PositiveInt
from starlette.responses import Response  # noqa: TC002 # Runtime annotation evaluation needs this.

from app.api.common.crud.filtering import create_filter_dependency
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.file_storage.filters import FileFilter, ImageFilter
from app.api.file_storage.schemas import FileReadWithinParent, ImageReadWithinParent
from app.api.reference_data.crud.categorized_resources import MATERIAL_RESOURCE
from app.api.reference_data.dependencies import CategoryFilterDep, MaterialFilterWithRelationshipsDep
from app.api.reference_data.models import Category, CategoryMaterialLink, Material
from app.api.reference_data.routers.categorized_reads import (
    list_categorized_reference_categories,
    page_categorized_references,
    require_categorized_reference,
)
from app.api.reference_data.routers.public_support import ReferenceDataAPIRouter
from app.api.reference_data.routers.reference_media import list_reference_file_reads, list_reference_image_reads
from app.api.reference_data.schemas import CategoryRead, MaterialReadWithRelationships
from app.core.responses import conditional_json_response

router = ReferenceDataAPIRouter(prefix="/materials", tags=["materials"])
_FILE_FILTER_DEPENDENCY = create_filter_dependency(FileFilter)
_IMAGE_FILTER_DEPENDENCY = create_filter_dependency(ImageFilter)


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
    payload = await page_categorized_references(
        session,
        Material,
        parent_filter=material_filter,
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
    payload = await require_categorized_reference(
        session,
        Material,
        material_id,
        read_schema=MaterialReadWithRelationships,
    )
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
) -> list[Category]:
    """Get categories linked to a material."""
    return await list_categorized_reference_categories(
        session,
        parent_model=Material,
        parent_id=material_id,
        link_model=CategoryMaterialLink,
        link_parent_id_attr=CategoryMaterialLink.material_id,
        category_filter=category_filter,
    )


@router.get(
    "/{material_id}/files",
    response_model=list[FileReadWithinParent],
    summary="Get Material Files",
)
async def get_material_files(
    material_id: Annotated[PositiveInt, Path(description="ID of the Material")],
    session: AsyncSessionDep,
    item_filter: FileFilter = Depends(_FILE_FILTER_DEPENDENCY),
) -> list[FileReadWithinParent]:
    """Get all files associated with a material."""
    return await list_reference_file_reads(session, MATERIAL_RESOURCE.files, material_id, item_filter)


@router.get(
    "/{material_id}/images",
    response_model=list[ImageReadWithinParent],
    summary="Get Material Images",
)
async def get_material_images(
    material_id: Annotated[PositiveInt, Path(description="ID of the Material")],
    session: AsyncSessionDep,
    item_filter: ImageFilter = Depends(_IMAGE_FILTER_DEPENDENCY),
) -> list[ImageReadWithinParent]:
    """Get all images associated with a material."""
    return await list_reference_image_reads(session, MATERIAL_RESOURCE.images, material_id, item_filter)
