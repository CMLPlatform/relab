"""Admin material routers for reference data."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, Form, Path, Security, UploadFile
from fastapi import File as FastAPIFile
from pydantic import UUID4, BeforeValidator, PositiveInt

from app.api.auth.dependencies import current_active_superuser
from app.api.auth.services.rate_limiter import API_UPLOAD_RATE_LIMIT_DEPENDENCY
from app.api.common.openapi_examples import IMAGE_METADATA_JSON_STRING_OPENAPI_EXAMPLES
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.file_storage.schemas import FileReadWithinParent, ImageReadWithinParent, empty_str_to_none
from app.api.reference_data.crud.categorized_resources import (
    MATERIAL_RESOURCE,
    add_categorized_reference_categories,
    create_categorized_reference,
    delete_categorized_reference,
    remove_categorized_reference_categories,
)
from app.api.reference_data.crud.persistence import update_reference_model
from app.api.reference_data.examples import CATEGORY_IDS_OPENAPI_EXAMPLES
from app.api.reference_data.models import Category, Material
from app.api.reference_data.routers.reference_media import reference_file_create, reference_image_create
from app.api.reference_data.schemas import CategoryRead, MaterialCreateWithCategories, MaterialRead, MaterialUpdate

router = APIRouter(prefix="/materials", tags=["materials"])


@router.post(
    "",
    response_model=MaterialRead,
    summary="Create material",
    status_code=201,
)
async def create_material(
    session: AsyncSessionDep,
    payload: MaterialCreateWithCategories,
) -> Material:
    """Create a material."""
    return await create_categorized_reference(session, MATERIAL_RESOURCE, payload)


@router.patch(
    "/{material_id}",
    response_model=MaterialRead,
    summary="Update material",
)
async def update_material(
    material_id: Annotated[PositiveInt, Path(description="Material ID")],
    session: AsyncSessionDep,
    payload: MaterialUpdate,
) -> Material:
    """Update a material."""
    return await update_reference_model(session, Material, material_id, payload)


@router.delete(
    "/{material_id}",
    summary="Delete material",
    status_code=204,
)
async def delete_material(
    material_id: Annotated[PositiveInt, Path(description="Material ID")],
    session: AsyncSessionDep,
) -> None:
    """Delete a material."""
    await delete_categorized_reference(session, MATERIAL_RESOURCE, material_id)


@router.post(
    "/{material_id}/categories",
    response_model=list[CategoryRead],
    summary="Add multiple categories to the material",
    status_code=201,
)
async def add_categories_to_material(
    material_id: Annotated[int, Path(description="Material ID", gt=0)],
    session: AsyncSessionDep,
    category_ids: Annotated[
        set[int],
        Body(
            description="Category IDs to assign to the material",
            openapi_examples=CATEGORY_IDS_OPENAPI_EXAMPLES,
        ),
    ],
) -> list[Category]:
    """Add multiple categories to a material."""
    return list(await add_categorized_reference_categories(session, MATERIAL_RESOURCE, material_id, set(category_ids)))


@router.delete(
    "/{material_id}/categories",
    summary="Remove multiple categories from the material",
    status_code=204,
)
async def remove_categories_from_material(
    material_id: Annotated[int, Path(description="Material ID", gt=0)],
    session: AsyncSessionDep,
    category_ids: Annotated[
        set[int],
        Body(
            description="Category IDs to remove from the material",
            openapi_examples=CATEGORY_IDS_OPENAPI_EXAMPLES,
        ),
    ],
) -> None:
    """Remove multiple categories from a material."""
    await remove_categorized_reference_categories(session, MATERIAL_RESOURCE, material_id, set(category_ids))


@router.post(
    "/{material_id}/files",
    response_model=FileReadWithinParent,
    status_code=201,
    dependencies=[Security(current_active_superuser), API_UPLOAD_RATE_LIMIT_DEPENDENCY],
    summary="Add File to Material",
)
async def upload_material_file(
    material_id: Annotated[PositiveInt, Path(description="ID of the Material")],
    session: AsyncSessionDep,
    file: Annotated[UploadFile, FastAPIFile(description="A file to upload")],
    description: Annotated[str | None, Form()] = None,
) -> FileReadWithinParent:
    """Upload a new file for the material."""
    item = await MATERIAL_RESOURCE.files.create(
        session,
        material_id,
        reference_file_create(
            material_id,
            parent_type=MATERIAL_RESOURCE.files.parent_type,
            file=file,
            description=description,
        ),
    )
    return FileReadWithinParent.model_validate(item)


@router.delete(
    "/{material_id}/files/{file_id}",
    dependencies=[Security(current_active_superuser)],
    summary="Remove File from Material",
    status_code=204,
)
async def delete_material_file(
    material_id: Annotated[PositiveInt, Path(description="ID of the Material")],
    file_id: Annotated[UUID4, Path(description="ID of the file")],
    session: AsyncSessionDep,
) -> None:
    """Remove a file from the material."""
    await MATERIAL_RESOURCE.files.delete(session, material_id, file_id)


@router.post(
    "/{material_id}/images",
    response_model=ImageReadWithinParent,
    status_code=201,
    dependencies=[Security(current_active_superuser), API_UPLOAD_RATE_LIMIT_DEPENDENCY],
    summary="Add Image to Material",
)
async def upload_material_image(
    material_id: Annotated[PositiveInt, Path(description="ID of the Material")],
    session: AsyncSessionDep,
    file: Annotated[UploadFile, FastAPIFile(description="An image to upload")],
    description: Annotated[str | None, Form()] = None,
    image_metadata: Annotated[
        str | None,
        Form(
            description="Image metadata in JSON string format",
            openapi_examples=IMAGE_METADATA_JSON_STRING_OPENAPI_EXAMPLES,
        ),
        BeforeValidator(empty_str_to_none),
    ] = None,
) -> ImageReadWithinParent:
    """Upload a new image for the material."""
    item = await MATERIAL_RESOURCE.images.create(
        session,
        material_id,
        reference_image_create(
            material_id,
            parent_type=MATERIAL_RESOURCE.images.parent_type,
            file=file,
            description=description,
            image_metadata=image_metadata,
        ),
    )
    return ImageReadWithinParent.model_validate(item)


@router.delete(
    "/{material_id}/images/{image_id}",
    dependencies=[Security(current_active_superuser)],
    summary="Remove Image from Material",
    status_code=204,
)
async def delete_material_image(
    material_id: Annotated[PositiveInt, Path(description="ID of the Material")],
    image_id: Annotated[UUID4, Path(description="ID of the image")],
    session: AsyncSessionDep,
) -> None:
    """Remove an image from the material."""
    await MATERIAL_RESOURCE.images.delete(session, material_id, image_id)
