"""Mutation-focused routers for base product endpoints.

File/image routes here are scoped to base products only. Component-scoped
media routes live in ``component_media_routers.py`` and share handlers via
``media_handlers``.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Body, Depends, Form, Path, UploadFile
from fastapi import File as FastAPIFile
from pydantic import UUID4, BeforeValidator

from app.api.auth.dependencies import CurrentActiveVerifiedUserDep
from app.api.auth.services.rate_limiter import API_UPLOAD_RATE_LIMIT_DEPENDENCY
from app.api.common.crud.filtering import create_filter_dependency
from app.api.common.openapi_examples import IMAGE_METADATA_JSON_STRING_OPENAPI_EXAMPLES
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.common.schemas.base import ProductRead
from app.api.data_collection.crud.product_commands import create_component
from app.api.data_collection.crud.product_commands import create_product as create_product_record
from app.api.data_collection.crud.product_commands import delete_product as delete_product_record
from app.api.data_collection.crud.product_commands import update_product as update_product_record
from app.api.data_collection.dependencies import (
    BaseProductDep,
    UserOwnedBaseProductDep,
    get_user_owned_base_product_id,
)
from app.api.data_collection.examples import (
    COMPONENT_CREATE_OPENAPI_EXAMPLES,
    PRODUCT_CREATE_OPENAPI_EXAMPLES,
)
from app.api.data_collection.presentation.product_reads import to_component_read, to_product_read
from app.api.data_collection.routers.media_handlers import (
    handle_delete_file,
    handle_delete_image,
    handle_get_file,
    handle_get_image,
    handle_list_files,
    handle_list_images,
    handle_upload_file,
    handle_upload_image,
)
from app.api.data_collection.schemas import (
    ComponentCreateWithComponents,
    ComponentReadWithRecursiveComponents,
    ProductCreateWithComponents,
    ProductUpdate,
)
from app.api.file_storage.filters import FileFilter, ImageFilter
from app.api.file_storage.schemas import (
    FileReadWithinParent,
    ImageReadWithinParent,
    empty_str_to_none,
)

product_mutation_router = PublicAPIRouter(prefix="/products", tags=["products"])
_FILE_FILTER_DEPENDENCY = create_filter_dependency(FileFilter)
_IMAGE_FILTER_DEPENDENCY = create_filter_dependency(ImageFilter)


@product_mutation_router.post(
    "",
    response_model=ProductRead,
    summary="Create a new product, optionally with components",
    status_code=201,
)
async def create_product(
    product: Annotated[
        ProductCreateWithComponents,
        Body(
            description="Product to create",
            openapi_examples=PRODUCT_CREATE_OPENAPI_EXAMPLES,
        ),
    ],
    current_user: CurrentActiveVerifiedUserDep,
    session: AsyncSessionDep,
) -> ProductRead:
    """Create a new product."""
    created = await create_product_record(session, product, current_user.id)
    await session.refresh(created, attribute_names=["owner"])
    return to_product_read(created, ProductRead, current_user)


@product_mutation_router.patch("/{product_id}", response_model=ProductRead, summary="Update base product")
async def update_product(
    product_update: ProductUpdate,
    db_product: UserOwnedBaseProductDep,
    session: AsyncSessionDep,
    current_user: CurrentActiveVerifiedUserDep,
) -> ProductRead:
    """Update an existing base product. Use ``PATCH /components/{id}`` for components."""
    updated = await update_product_record(session, db_product.id, product_update)
    await session.refresh(updated, attribute_names=["owner"])
    return to_product_read(updated, ProductRead, current_user)


@product_mutation_router.delete(
    "/{product_id}",
    status_code=204,
    summary="Delete base product",
)
async def delete_product(db_product: UserOwnedBaseProductDep, session: AsyncSessionDep) -> None:
    """Delete a base product, cascading to its components. Use ``DELETE /components/{id}`` for a component."""
    await delete_product_record(session, db_product.id)


@product_mutation_router.post(
    "/{product_id}/components",
    response_model=ComponentReadWithRecursiveComponents,
    status_code=201,
    summary="Create a new component under a base product",
)
async def add_component_to_product(
    db_product: UserOwnedBaseProductDep,
    component: Annotated[
        ComponentCreateWithComponents,
        Body(openapi_examples=COMPONENT_CREATE_OPENAPI_EXAMPLES),
    ],
    session: AsyncSessionDep,
    current_user: CurrentActiveVerifiedUserDep,
) -> ComponentReadWithRecursiveComponents:
    """Create a new component under the given base product."""
    created = await create_component(
        db=session,
        component=component,
        parent_product=db_product,
    )
    await session.refresh(created, attribute_names=["owner", "components"])
    return to_component_read(created, ComponentReadWithRecursiveComponents, current_user)


### File routes (scoped to base products only) ###


@product_mutation_router.get(
    "/{product_id}/files",
    response_model=list[FileReadWithinParent],
    summary="List files attached to a base product",
)
async def get_product_files(
    db_product: BaseProductDep,
    session: AsyncSessionDep,
    item_filter: FileFilter = Depends(_FILE_FILTER_DEPENDENCY),
) -> list[FileReadWithinParent]:
    """List all files attached to a base product."""
    return await handle_list_files(session, db_product.id, item_filter)


@product_mutation_router.get(
    "/{product_id}/files/{file_id}",
    response_model=FileReadWithinParent,
    summary="Get a specific base-product file",
)
async def get_product_file(
    db_product: BaseProductDep,
    file_id: Annotated[UUID4, Path(description="ID of the file")],
    session: AsyncSessionDep,
) -> FileReadWithinParent:
    """Get a specific file attached to a base product."""
    return await handle_get_file(session, db_product.id, file_id)


@product_mutation_router.post(
    "/{product_id}/files",
    response_model=FileReadWithinParent,
    status_code=201,
    summary="Upload a file to a base product",
    dependencies=[API_UPLOAD_RATE_LIMIT_DEPENDENCY],
)
async def upload_product_file(
    session: AsyncSessionDep,
    parent_id: Annotated[int, Depends(get_user_owned_base_product_id)],
    file: Annotated[UploadFile, FastAPIFile(description="A file to upload")],
    description: Annotated[str | None, Form()] = None,
) -> FileReadWithinParent:
    """Upload a new file for a base product."""
    return await handle_upload_file(session, parent_id, file=file, description=description)


@product_mutation_router.delete(
    "/{product_id}/files/{file_id}",
    summary="Remove a file from a base product",
    status_code=204,
)
async def delete_product_file(
    parent_id: Annotated[int, Depends(get_user_owned_base_product_id)],
    file_id: Annotated[UUID4, Path(description="ID of the file")],
    session: AsyncSessionDep,
) -> None:
    """Remove a file from a base product."""
    await handle_delete_file(session, parent_id, file_id)


### Image routes (scoped to base products only) ###


@product_mutation_router.get(
    "/{product_id}/images",
    response_model=list[ImageReadWithinParent],
    summary="List images attached to a base product",
)
async def get_product_images(
    db_product: BaseProductDep,
    session: AsyncSessionDep,
    item_filter: ImageFilter = Depends(_IMAGE_FILTER_DEPENDENCY),
) -> list[ImageReadWithinParent]:
    """List all images attached to a base product."""
    return await handle_list_images(session, db_product.id, item_filter)


@product_mutation_router.get(
    "/{product_id}/images/{image_id}",
    response_model=ImageReadWithinParent,
    summary="Get a specific base-product image",
)
async def get_product_image(
    db_product: BaseProductDep,
    image_id: Annotated[UUID4, Path(description="ID of the image")],
    session: AsyncSessionDep,
) -> ImageReadWithinParent:
    """Get a specific image attached to a base product."""
    return await handle_get_image(session, db_product.id, image_id)


@product_mutation_router.post(
    "/{product_id}/images",
    response_model=ImageReadWithinParent,
    status_code=201,
    summary="Upload an image to a base product",
    dependencies=[API_UPLOAD_RATE_LIMIT_DEPENDENCY],
)
async def upload_product_image(
    session: AsyncSessionDep,
    parent_id: Annotated[int, Depends(get_user_owned_base_product_id)],
    file: Annotated[UploadFile, FastAPIFile(description="An image to upload")],
    current_user: CurrentActiveVerifiedUserDep,
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
    """Upload a new image for a base product."""
    return await handle_upload_image(
        session,
        parent_id,
        file=file,
        description=description,
        image_metadata=image_metadata,
        current_user=current_user,
    )


@product_mutation_router.delete(
    "/{product_id}/images/{image_id}",
    summary="Remove an image from a base product",
    status_code=204,
)
async def delete_product_image(
    parent_id: Annotated[int, Depends(get_user_owned_base_product_id)],
    image_id: Annotated[UUID4, Path(description="ID of the image")],
    session: AsyncSessionDep,
) -> None:
    """Remove an image from a base product."""
    await handle_delete_image(session, parent_id, image_id)
