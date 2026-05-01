"""Admin material routers for reference data."""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated

from fastapi import APIRouter, Body, Form, Path, Security, UploadFile
from fastapi import File as FastAPIFile
from pydantic import UUID4, BeforeValidator, PositiveInt

from app.api.auth.dependencies import current_active_superuser
from app.api.auth.services.rate_limiter import API_UPLOAD_RATE_LIMIT_DEPENDENCY
from app.api.common.form_json import parse_optional_json_object
from app.api.common.openapi_examples import IMAGE_METADATA_JSON_STRING_OPENAPI_EXAMPLES
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.file_storage.models import MediaParentType
from app.api.file_storage.schemas import (
    FileCreate,
    FileReadWithinParent,
    ImageCreateFromForm,
    ImageReadWithinParent,
    empty_str_to_none,
)
from app.api.reference_data.crud.materials import (
    add_categories_to_material as add_material_categories,
)
from app.api.reference_data.crud.materials import (
    add_category_to_material as add_material_category,
)
from app.api.reference_data.crud.materials import (
    create_material as create_material_record,
)
from app.api.reference_data.crud.materials import (
    create_material_file,
    create_material_image,
)
from app.api.reference_data.crud.materials import (
    delete_material as delete_material_record,
)
from app.api.reference_data.crud.materials import (
    delete_material_file as delete_material_file_record,
)
from app.api.reference_data.crud.materials import (
    delete_material_image as delete_material_image_record,
)
from app.api.reference_data.crud.materials import (
    remove_categories_from_material as remove_material_categories,
)
from app.api.reference_data.crud.materials import (
    update_material as update_material_record,
)
from app.api.reference_data.examples import CATEGORY_IDS_OPENAPI_EXAMPLES
from app.api.reference_data.models import Category, Material
from app.api.reference_data.schemas import CategoryRead, MaterialCreateWithCategories, MaterialRead, MaterialUpdate

if TYPE_CHECKING:
    from collections.abc import Sequence

router = APIRouter(prefix="/materials", tags=["materials"])


def _material_file_create(material_id: int, *, file: UploadFile, description: str | None) -> FileCreate:
    """Build the canonical material file create payload."""
    return FileCreate(
        file=file,
        description=description,
        parent_id=material_id,
        parent_type=MediaParentType.MATERIAL,
    )


def _material_image_create(
    material_id: int,
    *,
    file: UploadFile,
    description: str | None,
    image_metadata: str | None,
) -> ImageCreateFromForm:
    """Build the canonical material image create payload."""
    return ImageCreateFromForm.model_validate(
        {
            "file": file,
            "description": description,
            "image_metadata": parse_optional_json_object(image_metadata, field_name="image_metadata"),
            "parent_id": material_id,
            "parent_type": MediaParentType.MATERIAL,
        }
    )


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
    return await create_material_record(session, payload)


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
    return await update_material_record(session, material_id, payload)


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
    await delete_material_record(session, material_id)


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
) -> Sequence[Category]:
    """Add multiple categories to a material."""
    return await add_material_categories(session, material_id, set(category_ids))


@router.post(
    "/{material_id}/categories/{category_id}",
    response_model=CategoryRead,
    summary="Add a category to the material",
    status_code=201,
)
async def add_category_to_material(
    material_id: Annotated[int, Path(description="Material ID", gt=0)],
    category_id: Annotated[int, Path(description="ID of category to add to the material", gt=0)],
    session: AsyncSessionDep,
) -> Category:
    """Add a single category to a material."""
    return await add_material_category(session, material_id, category_id)


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
    await remove_material_categories(session, material_id, set(category_ids))


@router.delete(
    "/{material_id}/categories/{category_id}",
    summary="Remove a category from the material",
    status_code=204,
)
async def remove_category_from_material(
    material_id: Annotated[int, Path(description="Material ID", gt=0)],
    category_id: Annotated[int, Path(description="ID of category to remove from the material", gt=0)],
    session: AsyncSessionDep,
) -> None:
    """Remove a single category from a material."""
    await remove_material_categories(session, material_id, category_id)


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
    item = await create_material_file(
        session,
        material_id,
        _material_file_create(material_id, file=file, description=description),
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
    await delete_material_file_record(session, material_id, file_id)


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
    item = await create_material_image(
        session,
        material_id,
        _material_image_create(material_id, file=file, description=description, image_metadata=image_metadata),
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
    await delete_material_image_record(session, material_id, image_id)
