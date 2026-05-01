"""Admin product-type routers for reference data."""

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
from app.api.reference_data.crud.product_types import (
    add_categories_to_product_type as add_product_type_categories,
)
from app.api.reference_data.crud.product_types import (
    add_category_to_product_type as add_product_type_category,
)
from app.api.reference_data.crud.product_types import (
    create_product_type as create_product_type_record,
)
from app.api.reference_data.crud.product_types import (
    create_product_type_file,
    create_product_type_image,
)
from app.api.reference_data.crud.product_types import (
    delete_product_type as delete_product_type_record,
)
from app.api.reference_data.crud.product_types import (
    delete_product_type_file as delete_product_type_file_record,
)
from app.api.reference_data.crud.product_types import (
    delete_product_type_image as delete_product_type_image_record,
)
from app.api.reference_data.crud.product_types import (
    remove_categories_from_product_type as remove_product_type_categories,
)
from app.api.reference_data.crud.product_types import (
    update_product_type as update_product_type_record,
)
from app.api.reference_data.examples import CATEGORY_IDS_OPENAPI_EXAMPLES
from app.api.reference_data.models import Category, ProductType
from app.api.reference_data.schemas import (
    CategoryRead,
    ProductTypeCreateWithCategories,
    ProductTypeRead,
    ProductTypeUpdate,
)

if TYPE_CHECKING:
    from collections.abc import Sequence

router = APIRouter(prefix="/product-types", tags=["product-types"])


def _product_type_file_create(
    product_type_id: int,
    *,
    file: UploadFile,
    description: str | None,
) -> FileCreate:
    """Build the canonical product-type file create payload."""
    return FileCreate(
        file=file,
        description=description,
        parent_id=product_type_id,
        parent_type=MediaParentType.PRODUCT_TYPE,
    )


def _product_type_image_create(
    product_type_id: int,
    *,
    file: UploadFile,
    description: str | None,
    image_metadata: str | None,
) -> ImageCreateFromForm:
    """Build the canonical product-type image create payload."""
    return ImageCreateFromForm.model_validate(
        {
            "file": file,
            "description": description,
            "image_metadata": parse_optional_json_object(image_metadata, field_name="image_metadata"),
            "parent_id": product_type_id,
            "parent_type": MediaParentType.PRODUCT_TYPE,
        }
    )


@router.post(
    "",
    response_model=ProductTypeRead,
    summary="Create product type",
    status_code=201,
)
async def create_product_type(
    session: AsyncSessionDep,
    payload: ProductTypeCreateWithCategories,
) -> ProductType:
    """Create a product type."""
    return await create_product_type_record(session, payload)


@router.patch(
    "/{product_type_id}",
    response_model=ProductTypeRead,
    summary="Update product type",
)
async def update_product_type(
    product_type_id: Annotated[PositiveInt, Path(description="Product Type ID")],
    session: AsyncSessionDep,
    payload: ProductTypeUpdate,
) -> ProductType:
    """Update a product type."""
    return await update_product_type_record(session, product_type_id, payload)


@router.delete(
    "/{product_type_id}",
    summary="Delete product type",
    status_code=204,
)
async def delete_product_type(
    product_type_id: Annotated[PositiveInt, Path(description="Product Type ID")],
    session: AsyncSessionDep,
) -> None:
    """Delete a product type."""
    await delete_product_type_record(session, product_type_id)


@router.post(
    "/{product_type_id}/categories",
    response_model=list[CategoryRead],
    summary="Add multiple categories to the product type",
    status_code=201,
)
async def add_categories_to_product_type(
    product_type_id: Annotated[int, Path(description="Product Type ID", gt=0)],
    session: AsyncSessionDep,
    category_ids: Annotated[
        set[int],
        Body(
            description="Category IDs to assign to the product type",
            openapi_examples=CATEGORY_IDS_OPENAPI_EXAMPLES,
        ),
    ],
) -> Sequence[Category]:
    """Add multiple categories to a product type."""
    return await add_product_type_categories(session, product_type_id, set(category_ids))


@router.post(
    "/{product_type_id}/categories/{category_id}",
    response_model=CategoryRead,
    summary="Add a category to the product type",
    status_code=201,
)
async def add_category_to_product_type(
    product_type_id: Annotated[int, Path(description="Product Type ID", gt=0)],
    category_id: Annotated[int, Path(description="ID of category to add to the product type", gt=0)],
    session: AsyncSessionDep,
) -> Category:
    """Add a single category to a product type."""
    return await add_product_type_category(session, product_type_id, category_id)


@router.delete(
    "/{product_type_id}/categories",
    summary="Remove multiple categories from the product type",
    status_code=204,
)
async def remove_categories_from_product_type(
    product_type_id: Annotated[int, Path(description="Product Type ID", gt=0)],
    session: AsyncSessionDep,
    category_ids: Annotated[
        set[int],
        Body(
            description="Category IDs to remove from the product type",
            openapi_examples=CATEGORY_IDS_OPENAPI_EXAMPLES,
        ),
    ],
) -> None:
    """Remove multiple categories from a product type."""
    await remove_product_type_categories(session, product_type_id, set(category_ids))


@router.delete(
    "/{product_type_id}/categories/{category_id}",
    summary="Remove a category from the product type",
    status_code=204,
)
async def remove_category_from_product_type(
    product_type_id: Annotated[int, Path(description="Product Type ID", gt=0)],
    category_id: Annotated[int, Path(description="ID of category to remove from the product type", gt=0)],
    session: AsyncSessionDep,
) -> None:
    """Remove a single category from a product type."""
    await remove_product_type_categories(session, product_type_id, category_id)


@router.post(
    "/{product_type_id}/files",
    response_model=FileReadWithinParent,
    status_code=201,
    dependencies=[Security(current_active_superuser), API_UPLOAD_RATE_LIMIT_DEPENDENCY],
    summary="Add File to Product Type",
)
async def upload_product_type_file(
    product_type_id: Annotated[PositiveInt, Path(description="ID of the Product Type")],
    session: AsyncSessionDep,
    file: Annotated[UploadFile, FastAPIFile(description="A file to upload")],
    description: Annotated[str | None, Form()] = None,
) -> FileReadWithinParent:
    """Upload a new file for the product type."""
    item = await create_product_type_file(
        session,
        product_type_id,
        _product_type_file_create(product_type_id, file=file, description=description),
    )
    return FileReadWithinParent.model_validate(item)


@router.delete(
    "/{product_type_id}/files/{file_id}",
    dependencies=[Security(current_active_superuser)],
    summary="Remove File from Product Type",
    status_code=204,
)
async def delete_product_type_file(
    product_type_id: Annotated[PositiveInt, Path(description="ID of the Product Type")],
    file_id: Annotated[UUID4, Path(description="ID of the file")],
    session: AsyncSessionDep,
) -> None:
    """Remove a file from the product type."""
    await delete_product_type_file_record(session, product_type_id, file_id)


@router.post(
    "/{product_type_id}/images",
    response_model=ImageReadWithinParent,
    status_code=201,
    dependencies=[Security(current_active_superuser), API_UPLOAD_RATE_LIMIT_DEPENDENCY],
    summary="Add Image to Product Type",
)
async def upload_product_type_image(
    product_type_id: Annotated[PositiveInt, Path(description="ID of the Product Type")],
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
    """Upload a new image for the product type."""
    item = await create_product_type_image(
        session,
        product_type_id,
        _product_type_image_create(
            product_type_id,
            file=file,
            description=description,
            image_metadata=image_metadata,
        ),
    )
    return ImageReadWithinParent.model_validate(item)


@router.delete(
    "/{product_type_id}/images/{image_id}",
    dependencies=[Security(current_active_superuser)],
    summary="Remove Image from Product Type",
    status_code=204,
)
async def delete_product_type_image(
    product_type_id: Annotated[PositiveInt, Path(description="ID of the Product Type")],
    image_id: Annotated[UUID4, Path(description="ID of the image")],
    session: AsyncSessionDep,
) -> None:
    """Remove an image from the product type."""
    await delete_product_type_image_record(session, product_type_id, image_id)
