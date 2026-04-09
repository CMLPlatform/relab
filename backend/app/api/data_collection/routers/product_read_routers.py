"""Read-focused routers for product and component endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated

from fastapi import HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from fastapi_pagination.links import Page
from pydantic import UUID4, PositiveInt
from sqlalchemy import select

from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.background_data.routers.public import RecursionDepthQueryParam
from app.api.common.crud.base import get_model_by_id, get_models, get_nested_model_by_id, get_paginated_models
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.data_collection import crud
from app.api.data_collection.dependencies import ProductFilterWithRelationshipsDep
from app.api.data_collection.examples import PRODUCT_INCLUDE_OPENAPI_EXAMPLES
from app.api.data_collection.models.product import Product
from app.api.data_collection.schemas import (
    ComponentReadWithRecursiveComponents,
    ProductReadWithRecursiveComponents,
    ProductReadWithRelationshipsAndFlatComponents,
)
from app.api.data_collection.validators import validate_product

if TYPE_CHECKING:
    from collections.abc import Sequence

    from sqlalchemy import Select

user_product_redirect_router = PublicAPIRouter(prefix="/users/me/products", tags=["products"])
user_product_router = PublicAPIRouter(prefix="/users/{user_id}/products", tags=["products"])
product_read_router = PublicAPIRouter(prefix="/products", tags=["products"])

type ProductIncludeQueryParam = Annotated[
    set[str] | None,
    Query(
        description="Relationships to include",
        openapi_examples=PRODUCT_INCLUDE_OPENAPI_EXAMPLES,
    ),
]

type IncludeComponentsAsBaseProductsQueryParam = Annotated[
    bool | None,
    Query(description="Whether to include components as base products in the response"),
]


def convert_components_to_read_model(
    components: list[Product], max_depth: int = 1, current_depth: int = 0
) -> list[ComponentReadWithRecursiveComponents]:
    """Convert component ORM rows to the recursive read schema."""
    if current_depth >= max_depth:
        return []

    return [
        ComponentReadWithRecursiveComponents.model_validate(component).model_copy(
            update={
                "components": convert_components_to_read_model(component.components or [], max_depth, current_depth + 1)
            }
        )
        for component in components
    ]


@user_product_redirect_router.get(
    "",
    response_class=RedirectResponse,
    status_code=307,
    summary="Redirect to user's products",
)
async def redirect_to_current_user_products(
    current_user: CurrentActiveUserDep,
    request: Request,
) -> RedirectResponse:
    """Redirect /users/me/products to /users/{id}/products for better caching."""
    query_string = str(request.url.query)
    redirect_url = f"/users/{current_user.id}/products"
    if query_string:
        redirect_url += f"?{query_string}"
    return RedirectResponse(url=redirect_url, status_code=307)


@user_product_router.get(
    "",
    response_model=Page[ProductReadWithRelationshipsAndFlatComponents],
    summary="Get products collected by a user",
)
async def get_user_products(
    user_id: UUID4,
    session: AsyncSessionDep,
    current_user: CurrentActiveUserDep,
    product_filter: ProductFilterWithRelationshipsDep,
    include: ProductIncludeQueryParam = None,
    *,
    include_components_as_base_products: IncludeComponentsAsBaseProductsQueryParam = None,
) -> Page[Product]:
    """Get products collected by a specific user."""
    if user_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized to view this user's products")

    statement = select(Product).where(Product.owner_id == user_id)
    if not include_components_as_base_products:
        statement = statement.where(Product.parent_id.is_(None))

    return await get_paginated_models(
        session,
        Product,
        include_relationships=include,
        model_filter=product_filter,
        statement=statement,
        read_schema=ProductReadWithRelationshipsAndFlatComponents,
    )


@product_read_router.get(
    "",
    response_model=Page[ProductReadWithRelationshipsAndFlatComponents],
    summary="Get all products with optional relationships",
)
async def get_products(
    session: AsyncSessionDep,
    product_filter: ProductFilterWithRelationshipsDep,
    include: ProductIncludeQueryParam = None,
    *,
    include_components_as_base_products: IncludeComponentsAsBaseProductsQueryParam = None,
) -> Page[Product]:
    """Get all products with specified relationships."""
    if include_components_as_base_products:
        statement: Select[tuple[Product]] = select(Product)
    else:
        statement = select(Product).where(Product.parent_id.is_(None))

    return await get_paginated_models(
        session,
        Product,
        include_relationships=include,
        model_filter=product_filter,
        statement=statement,
        read_schema=ProductReadWithRelationshipsAndFlatComponents,
    )


@product_read_router.get(
    "/tree",
    response_model=list[ProductReadWithRecursiveComponents],
    summary="Get products tree",
)
async def get_products_tree(
    session: AsyncSessionDep,
    product_filter: ProductFilterWithRelationshipsDep,
    recursion_depth: RecursionDepthQueryParam = 1,
) -> list[ProductReadWithRecursiveComponents]:
    """Get all base products and their components in a tree structure."""
    products: Sequence[Product] = await crud.get_product_trees(
        session, recursion_depth=recursion_depth, product_filter=product_filter
    )
    return [
        ProductReadWithRecursiveComponents.model_validate(product).model_copy(
            update={
                "components": convert_components_to_read_model(product.components or [], max_depth=recursion_depth - 1)
            }
        )
        for product in products
    ]


@product_read_router.get(
    "/{product_id}",
    response_model=ProductReadWithRelationshipsAndFlatComponents,
    summary="Get product by ID",
)
async def get_product(
    session: AsyncSessionDep,
    product_id: PositiveInt,
    include: ProductIncludeQueryParam = None,
) -> Product:
    """Get product by ID with specified relationships."""
    return await get_model_by_id(
        session,
        Product,
        product_id,
        include_relationships=include,
        read_schema=ProductReadWithRelationshipsAndFlatComponents,
    )


@product_read_router.get(
    "/{product_id}/components/tree",
    summary="Get product component subtree",
    response_model=list[ComponentReadWithRecursiveComponents],
)
async def get_product_subtree(
    session: AsyncSessionDep,
    product_id: PositiveInt,
    product_filter: ProductFilterWithRelationshipsDep,
    recursion_depth: RecursionDepthQueryParam = 1,
) -> list[ComponentReadWithRecursiveComponents]:
    """Get a product's components in a tree structure, up to a specified depth."""
    products: Sequence[Product] = await crud.get_product_trees(
        session, recursion_depth=recursion_depth, parent_id=product_id, product_filter=product_filter
    )
    return [
        ComponentReadWithRecursiveComponents.model_validate(product).model_copy(
            update={
                "components": convert_components_to_read_model(product.components or [], max_depth=recursion_depth - 1)
            }
        )
        for product in products
    ]


@product_read_router.get(
    "/{product_id}/components",
    response_model=list[ProductReadWithRelationshipsAndFlatComponents],
    summary="Get product components",
)
async def get_product_components(
    session: AsyncSessionDep,
    product_id: PositiveInt,
    product_filter: ProductFilterWithRelationshipsDep,
    include: ProductIncludeQueryParam = None,
) -> Sequence[Product]:
    """Get all components of a product."""
    await get_model_by_id(session, Product, product_id)
    return await get_models(
        session,
        Product,
        include_relationships=include,
        model_filter=product_filter,
        statement=select(Product).where(Product.parent_id == product_id),
        read_schema=ProductReadWithRelationshipsAndFlatComponents,
    )


@product_read_router.get(
    "/{product_id}/components/{component_id}",
    response_model=ProductReadWithRelationshipsAndFlatComponents,
    summary="Get product component by ID",
)
async def get_product_component(
    product_id: PositiveInt,
    component_id: PositiveInt,
    *,
    include: ProductIncludeQueryParam = None,
    session: AsyncSessionDep,
) -> Product:
    """Get component by ID with specified relationships."""
    return await get_nested_model_by_id(
        session,
        Product,
        product_id,
        Product,
        component_id,
        "parent_id",
        include_relationships=include,
        read_schema=ProductReadWithRelationshipsAndFlatComponents,
    )


@product_read_router.post(
    "/{product_id}/validate",
    summary="Validate product tree",
    response_model=dict[str, bool | list[str]],
)
async def validate_product_tree(
    session: AsyncSessionDep,
    product_id: PositiveInt,
) -> dict[str, bool | list[str]]:
    """Validate the product hierarchy and bill-of-materials constraints.

    Returns ``{"valid": true, "errors": []}`` when the tree passes all checks,
    or ``{"valid": false, "errors": [...]}`` with human-readable messages otherwise.
    """
    product = await get_model_by_id(session, Product, product_id)
    try:
        validate_product(product)
    except ValueError as exc:
        return {"valid": False, "errors": [str(exc)]}
    return {"valid": True, "errors": []}
