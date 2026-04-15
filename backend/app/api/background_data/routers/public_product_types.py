"""Public product-type routers for background data."""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated, cast

from fastapi import Path
from fastapi_filter import FilterDepends
from fastapi_pagination import Page
from pydantic import UUID4, PositiveInt
from sqlalchemy import Select, select

from app.api.background_data.crud.product_types import (
    get_product_type_file as load_product_type_file,
)
from app.api.background_data.crud.product_types import (
    get_product_type_image as load_product_type_image,
)
from app.api.background_data.crud.product_types import (
    list_product_type_files,
    list_product_type_images,
)
from app.api.background_data.dependencies import CategoryFilterDep, ProductTypeFilterWithRelationshipsDep
from app.api.background_data.models import Category, CategoryProductTypeLink, ProductType
from app.api.background_data.routers.public_support import BackgroundDataAPIRouter
from app.api.background_data.schemas import CategoryRead, ProductTypeReadWithRelationships
from app.api.common.crud.loading import apply_loader_profile
from app.api.common.crud.query import page_models, require_model
from app.api.common.exceptions import BadRequestError
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.file_storage.filters import FileFilter, ImageFilter
from app.api.file_storage.schemas import FileReadWithinParent, ImageReadWithinParent

if TYPE_CHECKING:
    from collections.abc import Sequence

router = BackgroundDataAPIRouter(prefix="/product-types", tags=["product-types"])


async def _require_product_type(session: AsyncSessionDep, product_type_id: PositiveInt) -> ProductType:
    """Load a product type with the standard public relationships."""
    return await require_model(
        session,
        ProductType,
        product_type_id,
        loaders={"categories", "images", "files"},
        read_schema=ProductTypeReadWithRelationships,
    )


async def _get_linked_product_type_category(
    session: AsyncSessionDep,
    *,
    product_type_id: PositiveInt,
    category_id: PositiveInt,
) -> Category:
    """Load one category linked to a product type."""
    await require_model(session, ProductType, product_type_id)
    statement = (
        select(Category)
        .join(CategoryProductTypeLink, Category.id == CategoryProductTypeLink.category_id)
        .where(CategoryProductTypeLink.product_type_id == product_type_id, Category.id == category_id)
    )
    statement = apply_loader_profile(statement, Category, read_schema=CategoryRead)
    category = (await session.execute(statement)).scalars().unique().one_or_none()
    if category is None:
        msg = "Category is not linked to ProductType"
        raise BadRequestError(msg)
    return category


async def _list_product_type_categories(
    session: AsyncSessionDep,
    *,
    product_type_id: PositiveInt,
    category_filter: CategoryFilterDep,
) -> Sequence[Category]:
    """List categories linked to a product type."""
    await require_model(session, ProductType, product_type_id)
    statement: Select[tuple[Category]] = (
        select(Category)
        .join(CategoryProductTypeLink, Category.id == CategoryProductTypeLink.category_id)
        .where(CategoryProductTypeLink.product_type_id == product_type_id)
    )
    statement = cast("Select[tuple[Category]]", category_filter.filter(statement))
    statement = cast(
        "Select[tuple[Category]]",
        apply_loader_profile(statement, Category, read_schema=CategoryRead),
    )
    return list((await session.execute(statement)).scalars().unique().all())


@router.get(
    "",
    response_model=Page[ProductTypeReadWithRelationships],
    summary="Get all product types with all relationships",
)
async def get_product_types(
    session: AsyncSessionDep,
    product_type_filter: ProductTypeFilterWithRelationshipsDep,
) -> Page[ProductType]:
    """Get a list of all product types with all relationships loaded."""
    return await page_models(
        session,
        ProductType,
        loaders={"categories", "images", "files"},
        filters=product_type_filter,
        read_schema=ProductTypeReadWithRelationships,
    )


@router.get(
    "/{product_type_id}",
    response_model=ProductTypeReadWithRelationships,
    summary="Get product type by ID with all relationships",
)
async def get_product_type(
    session: AsyncSessionDep,
    product_type_id: PositiveInt,
) -> ProductType:
    """Get a single product type by ID with all relationships loaded."""
    return await _require_product_type(session, product_type_id)


@router.get(
    "/{product_type_id}/categories",
    response_model=list[CategoryRead],
    summary="View categories of product type",
)
async def get_product_type_categories(
    product_type_id: PositiveInt,
    session: AsyncSessionDep,
    category_filter: CategoryFilterDep,
) -> Sequence[Category]:
    """Get categories linked to a product type."""
    return await _list_product_type_categories(
        session,
        product_type_id=product_type_id,
        category_filter=category_filter,
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
) -> Category:
    """Get a product type category by ID."""
    return await _get_linked_product_type_category(session, product_type_id=product_type_id, category_id=category_id)


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
    items = await list_product_type_files(session, product_type_id, filter_params=item_filter)
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
    item = await load_product_type_file(session, product_type_id, file_id)
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
    items = await list_product_type_images(session, product_type_id, filter_params=item_filter)
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
    item = await load_product_type_image(session, product_type_id, image_id)
    return ImageReadWithinParent.model_validate(item)
