"""Read-focused routers for product and component endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated

from fastapi import HTTPException, Request
from fastapi.responses import RedirectResponse
from fastapi_pagination.links import Page
from pydantic import UUID4, PositiveInt
from sqlmodel import col, select

from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.background_data.routers.public import RecursionDepthQueryParam
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.common.routers.read_helpers import (
    get_model_response,
    get_nested_model_response,
    list_models_response,
    list_models_sequence_response,
)
from app.api.data_collection import crud
from app.api.data_collection.dependencies import ProductFilterWithRelationshipsDep
from app.api.data_collection.models import Product
from app.api.data_collection.router_helpers import (
    include_components_as_base_products_query,
    product_include_query,
)
from app.api.data_collection.schemas import (
    ComponentReadWithRecursiveComponents,
    ProductReadWithRecursiveComponents,
    ProductReadWithRelationshipsAndFlatComponents,
)

if TYPE_CHECKING:
    from collections.abc import Sequence

    from sqlmodel.sql._expression_select_cls import SelectOfScalar

user_product_redirect_router = PublicAPIRouter(prefix="/users/me/products", tags=["products"])
user_product_router = PublicAPIRouter(prefix="/users/{user_id}/products", tags=["products"])
product_read_router = PublicAPIRouter(prefix="/products", tags=["products"])


def convert_components_to_read_model(
    components: list[Product], max_depth: int = 1, current_depth: int = 0
) -> list[ComponentReadWithRecursiveComponents]:
    """Convert component ORM rows to the recursive read schema."""
    if current_depth >= max_depth:
        return []

    return [
        ComponentReadWithRecursiveComponents.model_validate(
            component,
            update={
                "components": convert_components_to_read_model(component.components or [], max_depth, current_depth + 1)
            },
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
    include: Annotated[set[str] | None, product_include_query()] = None,
    *,
    include_components_as_base_products: Annotated[bool | None, include_components_as_base_products_query()] = None,
) -> Page[Product]:
    """Get products collected by a specific user."""
    if user_id != current_user.db_id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized to view this user's products")

    statement = select(Product).where(Product.owner_id == user_id)
    if not include_components_as_base_products:
        statement = statement.where(col(Product.parent_id).is_(None))

    return await list_models_response(
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
    include: Annotated[set[str] | None, product_include_query()] = None,
    *,
    include_components_as_base_products: Annotated[bool | None, include_components_as_base_products_query()] = None,
) -> Page[Product]:
    """Get all products with specified relationships."""
    if include_components_as_base_products:
        statement: SelectOfScalar[Product] = select(Product)
    else:
        statement = select(Product).where(col(Product.parent_id).is_(None))

    return await list_models_response(
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
        ProductReadWithRecursiveComponents.model_validate(
            product,
            update={
                "components": convert_components_to_read_model(product.components or [], max_depth=recursion_depth - 1)
            },
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
    include: Annotated[set[str] | None, product_include_query()] = None,
) -> Product:
    """Get product by ID with specified relationships."""
    return await get_model_response(
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
        ComponentReadWithRecursiveComponents.model_validate(
            product,
            update={
                "components": convert_components_to_read_model(product.components or [], max_depth=recursion_depth - 1)
            },
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
    include: Annotated[set[str] | None, product_include_query()] = None,
) -> Sequence[Product]:
    """Get all components of a product."""
    await get_model_response(session, Product, product_id)
    return await list_models_sequence_response(
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
    include: Annotated[set[str] | None, product_include_query()] = None,
    session: AsyncSessionDep,
) -> Product:
    """Get component by ID with specified relationships."""
    return await get_nested_model_response(
        session,
        Product,
        product_id,
        Product,
        component_id,
        "parent_id",
        include_relationships=include,
        read_schema=ProductReadWithRelationshipsAndFlatComponents,
    )
