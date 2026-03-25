"""Public product-type routers for background data."""

from __future__ import annotations

from typing import Annotated

from fastapi_pagination import Page
from pydantic import PositiveInt

from app.api.background_data import crud
from app.api.background_data.dependencies import ProductTypeFilterWithRelationshipsDep
from app.api.background_data.models import Category, CategoryProductTypeLink, ProductType
from app.api.background_data.router_factories import (
    MaterialIncludeExamples,
    add_linked_category_read_routes,
    relationship_include_query,
)
from app.api.background_data.routers.public_support import BackgroundDataAPIRouter
from app.api.background_data.schemas import CategoryRead, ProductTypeReadWithRelationships
from app.api.common.crud.associations import get_linked_model_by_id, get_linked_models
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.read_helpers import get_model_response, list_models_response
from app.api.file_storage.router_factories import StorageRouteMethod, add_storage_routes

router = BackgroundDataAPIRouter(prefix="/product-types", tags=["product-types"])


@router.get(
    "",
    response_model=Page[ProductTypeReadWithRelationships],
    summary="Get all product types",
)
async def get_product_types(
    session: AsyncSessionDep,
    product_type_filter: ProductTypeFilterWithRelationshipsDep,
    include: Annotated[set[str] | None, relationship_include_query(openapi_examples=MaterialIncludeExamples)] = None,
) -> Page[ProductType]:
    """Get a list of all product types."""
    return await list_models_response(
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
    include: Annotated[set[str] | None, relationship_include_query(openapi_examples=MaterialIncludeExamples)] = None,
) -> ProductType:
    """Get a single product type by ID with its categories and products."""
    return await get_model_response(
        session,
        ProductType,
        product_type_id,
        include_relationships=include,
        read_schema=ProductTypeReadWithRelationships,
    )


add_linked_category_read_routes(
    router,
    parent_path_param="product_type_id",
    parent_label="product type",
    get_categories=lambda session, parent_id, include, category_filter: get_linked_models(
        session,
        ProductType,
        parent_id,
        Category,
        CategoryProductTypeLink,
        "product_type_id",
        include_relationships=include,
        model_filter=category_filter,
        read_schema=CategoryRead,
    ),
    get_category=lambda session, parent_id, category_id, include: get_linked_model_by_id(
        session,
        ProductType,
        parent_id,
        Category,
        category_id,
        CategoryProductTypeLink,
        "product_type_id",
        "category_id",
        include=include,
        read_schema=CategoryRead,
    ),
)


add_storage_routes(
    router=router,
    parent_api_model_name=ProductType.get_api_model_name(),
    files_crud=crud.product_type_files,
    images_crud=crud.product_type_images,
    include_methods={StorageRouteMethod.GET},
)
