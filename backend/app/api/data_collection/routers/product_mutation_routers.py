"""Mutation-focused routers for product endpoints."""

from __future__ import annotations

import json
from typing import Annotated

from fastapi import Body, Depends, Form, Path, UploadFile
from fastapi import File as FastAPIFile
from fastapi_filter import FilterDepends
from pydantic import UUID4, BeforeValidator, PositiveInt

from app.api.auth.dependencies import CurrentActiveVerifiedUserDep
from app.api.auth.services.stats import recompute_user_stats
from app.api.common.crud.base import get_nested_model_by_id
from app.api.common.openapi_examples import IMAGE_METADATA_JSON_STRING_OPENAPI_EXAMPLES
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.common.schemas.base import ProductRead
from app.api.data_collection import crud
from app.api.data_collection.dependencies import UserOwnedProductDep, get_user_owned_product_id
from app.api.data_collection.examples import (
    COMPONENT_CREATE_OPENAPI_EXAMPLES,
    PRODUCT_CREATE_OPENAPI_EXAMPLES,
)
from app.api.data_collection.models.product import Product
from app.api.data_collection.schemas import (
    ComponentCreateWithComponents,
    ComponentReadWithRecursiveComponents,
    ProductCreateWithComponents,
    ProductUpdate,
)
from app.api.file_storage.filters import FileFilter, ImageFilter
from app.api.file_storage.models import MediaParentType
from app.api.file_storage.schemas import (
    FileCreate,
    FileReadWithinParent,
    ImageCreateFromForm,
    ImageReadWithinParent,
    empty_str_to_none,
)

product_mutation_router = PublicAPIRouter(prefix="/products", tags=["products"])


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
) -> Product:
    """Create a new product."""
    return await crud.create_product(session, product, current_user.id)


@product_mutation_router.patch("/{product_id}", response_model=ProductRead, summary="Update product")
async def update_product(
    product_update: ProductUpdate,
    db_product: UserOwnedProductDep,
    session: AsyncSessionDep,
) -> Product:
    """Update an existing product."""
    return await crud.update_product(session, db_product.id, product_update)


@product_mutation_router.delete(
    "/{product_id}",
    status_code=204,
    summary="Delete product",
)
async def delete_product(db_product: UserOwnedProductDep, session: AsyncSessionDep) -> None:
    """Delete a product, including components."""
    await crud.delete_product(session, db_product.id)


@product_mutation_router.post(
    "/{product_id}/components",
    response_model=ComponentReadWithRecursiveComponents,
    status_code=201,
    summary="Create a new component in a product",
)
async def add_component_to_product(
    db_product: UserOwnedProductDep,
    component: Annotated[
        ComponentCreateWithComponents,
        Body(openapi_examples=COMPONENT_CREATE_OPENAPI_EXAMPLES),
    ],
    session: AsyncSessionDep,
) -> Product:
    """Create a new component in an existing product."""
    return await crud.create_component(
        db=session,
        component=component,
        parent_product=db_product,
    )


@product_mutation_router.delete(
    "/{product_id}/components/{component_id}",
    status_code=204,
    summary="Delete product component",
)
async def delete_product_component(
    db_product: UserOwnedProductDep, component_id: PositiveInt, session: AsyncSessionDep
) -> None:
    """Delete a component in a product, including subcomponents."""
    await get_nested_model_by_id(session, Product, db_product.id, Product, component_id, "parent_id")
    await crud.delete_product(session, component_id)


@product_mutation_router.get(
    "/{product_id}/files",
    response_model=list[FileReadWithinParent],
    summary="Get Product Files",
)
async def get_product_files(
    product_id: Annotated[PositiveInt, Path(description="ID of the Product")],
    session: AsyncSessionDep,
    item_filter: FileFilter = FilterDepends(FileFilter),
) -> list[FileReadWithinParent]:
    """Get all files associated with a product."""
    items = await crud.product_files_crud.get_all(session, product_id, filter_params=item_filter)
    return [FileReadWithinParent.model_validate(item) for item in items]


@product_mutation_router.get(
    "/{product_id}/files/{file_id}",
    response_model=FileReadWithinParent,
    summary="Get specific Product File",
)
async def get_product_file(
    product_id: Annotated[PositiveInt, Path(description="ID of the Product")],
    file_id: Annotated[UUID4, Path(description="ID of the file")],
    session: AsyncSessionDep,
) -> FileReadWithinParent:
    """Get a specific file associated with a product."""
    item = await crud.product_files_crud.get_by_id(session, product_id, file_id)
    return FileReadWithinParent.model_validate(item)


@product_mutation_router.post(
    "/{product_id}/files",
    response_model=FileReadWithinParent,
    status_code=201,
    summary="Add File to Product",
)
async def upload_product_file(
    session: AsyncSessionDep,
    parent_id: Annotated[int, Depends(get_user_owned_product_id)],
    file: Annotated[UploadFile, FastAPIFile(description="A file to upload")],
    description: Annotated[str | None, Form()] = None,
) -> FileReadWithinParent:
    """Upload a new file for the product."""
    item = await crud.product_files_crud.create(
        session,
        parent_id,
        FileCreate(file=file, description=description, parent_id=parent_id, parent_type=MediaParentType.PRODUCT),
    )
    return FileReadWithinParent.model_validate(item)


@product_mutation_router.delete(
    "/{product_id}/files/{file_id}",
    summary="Remove File from Product",
    status_code=204,
)
async def delete_product_file(
    parent_id: Annotated[int, Depends(get_user_owned_product_id)],
    file_id: Annotated[UUID4, Path(description="ID of the file")],
    session: AsyncSessionDep,
) -> None:
    """Remove a file from the product."""
    await crud.product_files_crud.delete(session, parent_id, file_id)


@product_mutation_router.get(
    "/{product_id}/images",
    response_model=list[ImageReadWithinParent],
    summary="Get Product Images",
)
async def get_product_images(
    product_id: Annotated[PositiveInt, Path(description="ID of the Product")],
    session: AsyncSessionDep,
    item_filter: ImageFilter = FilterDepends(ImageFilter),
) -> list[ImageReadWithinParent]:
    """Get all images associated with a product."""
    items = await crud.product_images_crud.get_all(session, product_id, filter_params=item_filter)
    return [ImageReadWithinParent.model_validate(item) for item in items]


@product_mutation_router.get(
    "/{product_id}/images/{image_id}",
    response_model=ImageReadWithinParent,
    summary="Get specific Product Image",
)
async def get_product_image(
    product_id: Annotated[PositiveInt, Path(description="ID of the Product")],
    image_id: Annotated[UUID4, Path(description="ID of the image")],
    session: AsyncSessionDep,
) -> ImageReadWithinParent:
    """Get a specific image associated with a product."""
    item = await crud.product_images_crud.get_by_id(session, product_id, image_id)
    return ImageReadWithinParent.model_validate(item)


@product_mutation_router.post(
    "/{product_id}/images",
    response_model=ImageReadWithinParent,
    status_code=201,
    summary="Add Image to Product",
)
async def upload_product_image(
    session: AsyncSessionDep,
    parent_id: Annotated[int, Depends(get_user_owned_product_id)],
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
    """Upload a new image for the product."""
    item = await crud.product_images_crud.create(
        session,
        parent_id,
        ImageCreateFromForm.model_validate(
            {
                "file": file,
                "description": description,
                "image_metadata": json.loads(image_metadata) if image_metadata is not None else None,
                "parent_id": parent_id,
                "parent_type": MediaParentType.PRODUCT,
            }
        ),
    )
    await recompute_user_stats(session, current_user.id)
    await session.commit()
    return ImageReadWithinParent.model_validate(item)


@product_mutation_router.delete(
    "/{product_id}/images/{image_id}",
    summary="Remove Image from Product",
    status_code=204,
)
async def delete_product_image(
    parent_id: Annotated[int, Depends(get_user_owned_product_id)],
    image_id: Annotated[UUID4, Path(description="ID of the image")],
    session: AsyncSessionDep,
) -> None:
    """Remove an image from the product."""
    # Need owner ID for stats update
    product = await session.get(Product, parent_id)
    await crud.product_images_crud.delete(session, parent_id, image_id)
    if product:
        await recompute_user_stats(session, product.owner_id)
        await session.commit()
