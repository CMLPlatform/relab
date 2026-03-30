"""Public product-type routers for background data."""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated, cast

from fastapi import Path, Query
from fastapi_filter import FilterDepends
from fastapi_pagination import Page
from pydantic import UUID4, PositiveInt

from app.api.background_data import crud
from app.api.background_data.dependencies import CategoryFilterDep, ProductTypeFilterWithRelationshipsDep
from app.api.background_data.models import Category, CategoryProductTypeLink, ProductType
from app.api.background_data.routers.public_support import BackgroundDataAPIRouter
from app.api.background_data.schemas import CategoryRead, ProductTypeReadWithRelationships
from app.api.common.crud.associations import get_linked_model_by_id, get_linked_models
from app.api.common.crud.base import get_model_by_id, get_paginated_models
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.file_storage.filters import FileFilter, ImageFilter
from app.api.file_storage.schemas import FileReadWithinParent, ImageReadWithinParent

if TYPE_CHECKING:
    from collections.abc import Sequence

    from fastapi.openapi.models import Example

MATERIAL_INCLUDE_EXAMPLES = cast(
    "dict[str, Example]",
    {
        "none": {"value": []},
        "categories": {"value": ["categories"]},
        "all": {"value": ["categories", "files", "images", "product_links"]},
    },
)

TAXONOMY_CATEGORY_INCLUDE_EXAMPLES = cast(
    "dict[str, Example]",
    {
        "none": {"value": []},
        "taxonomy": {"value": ["taxonomy"]},
        "all": {"value": ["taxonomy", "subcategories"]},
    },
)

router = BackgroundDataAPIRouter(prefix="/product-types", tags=["product-types"])


@router.get(
    "",
    response_model=Page[ProductTypeReadWithRelationships],
    summary="Get all product types",
)
async def get_product_types(
    session: AsyncSessionDep,
    product_type_filter: ProductTypeFilterWithRelationshipsDep,
    include: Annotated[
        set[str] | None,
        Query(description="Relationships to include", openapi_examples=MATERIAL_INCLUDE_EXAMPLES),
    ] = None,
) -> Page[ProductType]:
    """Get a list of all product types."""
    return await get_paginated_models(
        session,
        ProductType,
        include_relationships=include,
        model_filter=product_type_filter,
        read_schema=ProductTypeReadWithRelationships,
    )


@router.get(
    "/{product_type_id}",
    response_model=ProductTypeReadWithRelationships,
    summary="Get product type by ID",
)
async def get_product_type(
    session: AsyncSessionDep,
    product_type_id: PositiveInt,
    include: Annotated[
        set[str] | None,
        Query(description="Relationships to include", openapi_examples=MATERIAL_INCLUDE_EXAMPLES),
    ] = None,
) -> ProductType:
    """Get a single product type by ID with its categories and products."""
    return await get_model_by_id(
        session,
        ProductType,
        product_type_id,
        include_relationships=include,
        read_schema=ProductTypeReadWithRelationships,
    )


@router.get(
    "/{product_type_id}/categories",
    response_model=list[CategoryRead],
    summary="View categories of product type",
)
async def get_product_type_categories(
    product_type_id: PositiveInt,
    session: AsyncSessionDep,
    category_filter: CategoryFilterDep,
    include: Annotated[
        set[str] | None,
        Query(description="Relationships to include", openapi_examples=TAXONOMY_CATEGORY_INCLUDE_EXAMPLES),
    ] = None,
) -> Sequence[Category]:
    """Get categories linked to a product type."""
    return await get_linked_models(
        session,
        ProductType,
        product_type_id,
        Category,
        CategoryProductTypeLink,
        "product_type_id",
        include_relationships=include,
        model_filter=category_filter,
        read_schema=CategoryRead,
    )


@router.get(
    "/{product_type_id}/categories/{category_id}",
    response_model=CategoryRead,
    summary="Get category by ID",
)
async def get_product_type_category(
    product_type_id: PositiveInt,
    category_id: PositiveInt,
    session: AsyncSessionDep,
    include: Annotated[
        set[str] | None,
        Query(description="Relationships to include", openapi_examples=TAXONOMY_CATEGORY_INCLUDE_EXAMPLES),
    ] = None,
) -> Category:
    """Get a product type category by ID."""
    return await get_linked_model_by_id(
        session,
        ProductType,
        product_type_id,
        Category,
        category_id,
        CategoryProductTypeLink,
        "product_type_id",
        "category_id",
        include=include,
        read_schema=CategoryRead,
    )


@router.get(
    "/{product_type_id}/files",
    response_model=list[FileReadWithinParent],
    summary="Get Product Type Files",
)
async def get_product_type_files(
    product_type_id: Annotated[PositiveInt, Path(description="ID of the Product Type")],
    session: AsyncSessionDep,
    item_filter: FileFilter = FilterDepends(FileFilter),
) -> list[FileReadWithinParent]:
    """Get all files associated with a product type."""
    items = await crud.product_type_files_crud.get_all(session, product_type_id, filter_params=item_filter)
    return [FileReadWithinParent.model_validate(item) for item in items]


@router.get(
    "/{product_type_id}/files/{file_id}",
    response_model=FileReadWithinParent,
    summary="Get specific Product Type File",
)
async def get_product_type_file(
    product_type_id: Annotated[PositiveInt, Path(description="ID of the Product Type")],
    file_id: Annotated[UUID4, Path(description="ID of the file")],
    session: AsyncSessionDep,
) -> FileReadWithinParent:
    """Get a specific file associated with a product type."""
    item = await crud.product_type_files_crud.get_by_id(session, product_type_id, file_id)
    return FileReadWithinParent.model_validate(item)


@router.get(
    "/{product_type_id}/images",
    response_model=list[ImageReadWithinParent],
    summary="Get Product Type Images",
)
async def get_product_type_images(
    product_type_id: Annotated[PositiveInt, Path(description="ID of the Product Type")],
    session: AsyncSessionDep,
    item_filter: ImageFilter = FilterDepends(ImageFilter),
) -> list[ImageReadWithinParent]:
    """Get all images associated with a product type."""
    items = await crud.product_type_images_crud.get_all(session, product_type_id, filter_params=item_filter)
    return [ImageReadWithinParent.model_validate(item) for item in items]


@router.get(
    "/{product_type_id}/images/{image_id}",
    response_model=ImageReadWithinParent,
    summary="Get specific Product Type Image",
)
async def get_product_type_image(
    product_type_id: Annotated[PositiveInt, Path(description="ID of the Product Type")],
    image_id: Annotated[UUID4, Path(description="ID of the image")],
    session: AsyncSessionDep,
) -> ImageReadWithinParent:
    """Get a specific image associated with a product type."""
    item = await crud.product_type_images_crud.get_by_id(session, product_type_id, image_id)
    return ImageReadWithinParent.model_validate(item)
