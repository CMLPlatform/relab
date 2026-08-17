"""Mutation-focused routers for base product endpoints.

File/image routes here are scoped to base products only. Component-scoped
media routes live in ``component_media_routers.py`` and share handlers via
``media_handlers``.
"""

from typing import Annotated

from fastapi import Body, Depends, Form, Path, UploadFile
from fastapi import File as FastAPIFile
from fastapi.responses import JSONResponse
from fastapi_pagination.links import Page
from pydantic import UUID4, BeforeValidator

from app.api.auth.dependencies import CurrentActiveVerifiedUserDep
from app.api.common.audiences import PublicAPIRouter
from app.api.common.crud.filtering import create_filter_dependency
from app.api.common.idempotency import IDEMPOTENCY_RESPONSES, IdempotencyKeyDep, idempotent_request
from app.api.common.openapi_examples import IMAGE_METADATA_JSON_STRING_OPENAPI_EXAMPLES
from app.api.common.rate_limiting import API_UPLOAD_RATE_LIMIT_DEPENDENCY, API_WRITE_RATE_LIMIT_DEPENDENCY
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.data_collection.crud.product_commands import create_component
from app.api.data_collection.crud.product_commands import create_product as create_product_record
from app.api.data_collection.crud.product_commands import delete_product as delete_product_record
from app.api.data_collection.crud.product_commands import update_product as update_product_record
from app.api.data_collection.dependencies import (
    BaseProductDep,
    UserOwnedBaseProductDep,
)
from app.api.data_collection.examples import (
    COMPONENT_CREATE_OPENAPI_EXAMPLES,
    PRODUCT_CREATE_OPENAPI_EXAMPLES,
)
from app.api.data_collection.presentation.product_reads import to_read_model
from app.api.data_collection.product_schemas import ProductRead
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
from app.core.redis import RedisDep

product_mutation_router = PublicAPIRouter(prefix="/products", tags=["products"])
_FILE_FILTER_DEPENDENCY = create_filter_dependency(FileFilter)
_IMAGE_FILTER_DEPENDENCY = create_filter_dependency(ImageFilter)


@product_mutation_router.post(
    "",
    response_model=ProductRead,
    summary="Create a new product, optionally with components",
    status_code=201,
    dependencies=[API_WRITE_RATE_LIMIT_DEPENDENCY],
    responses=IDEMPOTENCY_RESPONSES,
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
    redis: RedisDep,
    idempotency_key: IdempotencyKeyDep = None,
) -> ProductRead | JSONResponse:
    """Create a new product.

    An optional ``Idempotency-Key`` header makes a retried request safe: replaying the same
    key returns the original response instead of creating a second product. The key is bound to
    this user and this request body — reusing it with a different body is a 422.
    """
    async with idempotent_request(
        redis, user_id=current_user.id, endpoint="POST /products", key=idempotency_key, body=product
    ) as idem:
        if idem.replay is not None:
            return idem.replay
        created = await create_product_record(session, product, current_user.id)

    # Outside the guard: the row is committed, so a failure here must not release the marker.
    await session.refresh(created, attribute_names=["owner"])
    result = to_read_model(created, ProductRead, current_user)
    await idem.finish(201, result.model_dump(mode="json"))
    return result


@product_mutation_router.patch(
    "/{product_id}",
    response_model=ProductRead,
    summary="Update base product",
    dependencies=[API_WRITE_RATE_LIMIT_DEPENDENCY],
)
async def update_product(
    product_update: ProductUpdate,
    db_product: UserOwnedBaseProductDep,
    session: AsyncSessionDep,
    current_user: CurrentActiveVerifiedUserDep,
) -> ProductRead:
    """Update an existing base product. Use ``PATCH /components/{id}`` for components."""
    updated = await update_product_record(session, db_product.id, product_update)
    await session.refresh(updated, attribute_names=["owner"])
    return to_read_model(updated, ProductRead, current_user)


@product_mutation_router.delete(
    "/{product_id}",
    status_code=204,
    summary="Delete base product",
    dependencies=[API_WRITE_RATE_LIMIT_DEPENDENCY],
)
async def delete_product(db_product: UserOwnedBaseProductDep, session: AsyncSessionDep) -> None:
    """Delete a base product, cascading to its components. Use ``DELETE /components/{id}`` for a component."""
    await delete_product_record(session, db_product.id)


@product_mutation_router.post(
    "/{product_id}/components",
    response_model=ComponentReadWithRecursiveComponents,
    status_code=201,
    summary="Create a new component under a base product",
    dependencies=[API_WRITE_RATE_LIMIT_DEPENDENCY],
    responses=IDEMPOTENCY_RESPONSES,
)
async def add_component_to_product(
    db_product: UserOwnedBaseProductDep,
    component: Annotated[
        ComponentCreateWithComponents,
        Body(openapi_examples=COMPONENT_CREATE_OPENAPI_EXAMPLES),
    ],
    session: AsyncSessionDep,
    current_user: CurrentActiveVerifiedUserDep,
    redis: RedisDep,
    idempotency_key: IdempotencyKeyDep = None,
) -> ComponentReadWithRecursiveComponents | JSONResponse:
    """Create a new component under the given base product.

    An optional ``Idempotency-Key`` header makes a retried request safe: replaying the same
    key returns the original response instead of creating a second component. The key is bound to
    this user, this parent, and this request body — reusing it with a different body is a 422.
    """
    async with idempotent_request(
        redis,
        user_id=current_user.id,
        endpoint=f"POST /products/{db_product.id}/components",
        key=idempotency_key,
        body=component,
    ) as idem:
        if idem.replay is not None:
            return idem.replay
        created = await create_component(
            db=session,
            component=component,
            parent_product=db_product,
        )

    # Outside the guard: the row is committed, so a failure here must not release the marker.
    await session.refresh(created, attribute_names=["owner", "components"])
    result = to_read_model(created, ComponentReadWithRecursiveComponents, current_user)
    await idem.finish(201, result.model_dump(mode="json"))
    return result


### File routes (scoped to base products only) ###


@product_mutation_router.get(
    "/{product_id}/files",
    response_model=Page[FileReadWithinParent],
    summary="List files attached to a base product",
)
async def get_product_files(
    db_product: BaseProductDep,
    session: AsyncSessionDep,
    item_filter: FileFilter = Depends(_FILE_FILTER_DEPENDENCY),
) -> Page[FileReadWithinParent]:
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
    db_product: UserOwnedBaseProductDep,
    file: Annotated[UploadFile, FastAPIFile(description="A file to upload")],
    current_user: CurrentActiveVerifiedUserDep,
    description: Annotated[str | None, Form()] = None,
) -> FileReadWithinParent:
    """Upload a new file for a base product."""
    return await handle_upload_file(
        session, db_product.id, file=file, description=description, current_user=current_user
    )


@product_mutation_router.delete(
    "/{product_id}/files/{file_id}",
    summary="Remove a file from a base product",
    status_code=204,
)
async def delete_product_file(
    db_product: UserOwnedBaseProductDep,
    file_id: Annotated[UUID4, Path(description="ID of the file")],
    session: AsyncSessionDep,
) -> None:
    """Remove a file from a base product."""
    await handle_delete_file(session, db_product.id, file_id)


### Image routes (scoped to base products only) ###


@product_mutation_router.get(
    "/{product_id}/images",
    response_model=Page[ImageReadWithinParent],
    summary="List images attached to a base product",
)
async def get_product_images(
    db_product: BaseProductDep,
    session: AsyncSessionDep,
    item_filter: ImageFilter = Depends(_IMAGE_FILTER_DEPENDENCY),
) -> Page[ImageReadWithinParent]:
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
    db_product: UserOwnedBaseProductDep,
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
        db_product.id,
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
    db_product: UserOwnedBaseProductDep,
    image_id: Annotated[UUID4, Path(description="ID of the image")],
    session: AsyncSessionDep,
) -> None:
    """Remove an image from a base product."""
    await handle_delete_image(session, db_product.id, image_id)
