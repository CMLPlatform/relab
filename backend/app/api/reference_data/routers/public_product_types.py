"""Public product-type routers for reference data."""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated

from fastapi import Depends, Path
from fastapi_pagination import Page
from pydantic import PositiveInt
from sqlalchemy import Select, select

from app.api.common.crud.filtering import apply_filter, create_filter_dependency
from app.api.common.crud.loading import apply_loader_profile
from app.api.common.crud.pagination import paginate_select
from app.api.common.crud.query import require_model
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.file_storage.filters import FileFilter, ImageFilter
from app.api.file_storage.schemas import FileReadWithinParent, ImageReadWithinParent
from app.api.reference_data.crud.product_types import (
    list_product_type_files,
    list_product_type_images,
)
from app.api.reference_data.dependencies import CategoryFilterDep, ProductTypeFilterWithRelationshipsDep
from app.api.reference_data.models import Category, CategoryProductTypeLink, ProductType
from app.api.reference_data.routers.public_support import ReferenceDataAPIRouter
from app.api.reference_data.schemas import CategoryRead, ProductTypeReadWithRelationships

if TYPE_CHECKING:
    from collections.abc import Sequence

router = ReferenceDataAPIRouter(prefix="/product-types", tags=["product-types"])
_FILE_FILTER_DEPENDENCY = create_filter_dependency(FileFilter)
_IMAGE_FILTER_DEPENDENCY = create_filter_dependency(ImageFilter)


async def _require_product_type(session: AsyncSessionDep, product_type_id: PositiveInt) -> ProductType:
    """Load a product type with the standard public relationships."""
    return await require_model(
        session,
        ProductType,
        product_type_id,
        loaders={"categories", "images", "files"},
        read_schema=ProductTypeReadWithRelationships,
    )


async def _page_product_types(
    session: AsyncSessionDep,
    *,
    product_type_filter: ProductTypeFilterWithRelationshipsDep,
) -> Page[ProductType]:
    """Page public product types from an explicit product-type query."""
    statement: Select[tuple[ProductType]] = select(ProductType)
    statement = apply_filter(statement, ProductType, product_type_filter)
    statement = apply_loader_profile(
        statement,
        ProductType,
        {"categories", "images", "files"},
        read_schema=ProductTypeReadWithRelationships,
    )
    return await paginate_select(session, statement, model=ProductType)


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
    statement = apply_filter(statement, Category, category_filter)
    statement = apply_loader_profile(statement, Category, read_schema=CategoryRead)
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
    return await _page_product_types(session, product_type_filter=product_type_filter)


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
    "/{product_type_id}/files",
    response_model=list[FileReadWithinParent],
    summary="Get Product Type Files",
)
async def get_product_type_files(
    product_type_id: Annotated[PositiveInt, Path(description="ID of the Product Type")],
    session: AsyncSessionDep,
    item_filter: FileFilter = Depends(_FILE_FILTER_DEPENDENCY),
) -> list[FileReadWithinParent]:
    """Get all files associated with a product type."""
    items = await list_product_type_files(session, product_type_id, filter_params=item_filter)
    return [FileReadWithinParent.model_validate(item) for item in items]


@router.get(
    "/{product_type_id}/images",
    response_model=list[ImageReadWithinParent],
    summary="Get Product Type Images",
)
async def get_product_type_images(
    product_type_id: Annotated[PositiveInt, Path(description="ID of the Product Type")],
    session: AsyncSessionDep,
    item_filter: ImageFilter = Depends(_IMAGE_FILTER_DEPENDENCY),
) -> list[ImageReadWithinParent]:
    """Get all images associated with a product type."""
    items = await list_product_type_images(session, product_type_id, filter_params=item_filter)
    return [ImageReadWithinParent.model_validate(item) for item in items]
