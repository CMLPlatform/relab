"""Public product-type routers for reference data."""

from typing import Annotated

from fastapi import Depends, Path
from fastapi_pagination import Page
from pydantic import PositiveInt

from app.api.common.crud.filtering import create_filter_dependency
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.file_storage.filters import FileFilter, ImageFilter
from app.api.file_storage.schemas import FileReadWithinParent, ImageReadWithinParent
from app.api.reference_data.crud.categorized_resources import PRODUCT_TYPE_RESOURCE
from app.api.reference_data.dependencies import CategoryFilterDep, ProductTypeFilterWithRelationshipsDep
from app.api.reference_data.models import Category, CategoryProductTypeLink, ProductType
from app.api.reference_data.routers.categorized_reads import (
    list_categorized_reference_categories,
    page_categorized_references,
    require_categorized_reference,
)
from app.api.reference_data.routers.public_support import ReferenceDataAPIRouter
from app.api.reference_data.routers.reference_media import list_reference_media_reads
from app.api.reference_data.schemas import CategoryRead, ProductTypeReadWithRelationships

router = ReferenceDataAPIRouter(prefix="/product-types", tags=["product-types"])
_FILE_FILTER_DEPENDENCY = create_filter_dependency(FileFilter)
_IMAGE_FILTER_DEPENDENCY = create_filter_dependency(ImageFilter)


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
    return await page_categorized_references(
        session,
        ProductType,
        parent_filter=product_type_filter,
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
    return await require_categorized_reference(
        session,
        ProductType,
        product_type_id,
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
) -> list[Category]:
    """Get categories linked to a product type."""
    return await list_categorized_reference_categories(
        session,
        parent_model=ProductType,
        parent_id=product_type_id,
        link_model=CategoryProductTypeLink,
        link_parent_id_attr=CategoryProductTypeLink.product_type_id,
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
    return await list_reference_media_reads(
        session, PRODUCT_TYPE_RESOURCE.files, product_type_id, item_filter, read_schema=FileReadWithinParent
    )


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
    return await list_reference_media_reads(
        session, PRODUCT_TYPE_RESOURCE.images, product_type_id, item_filter, read_schema=ImageReadWithinParent
    )
