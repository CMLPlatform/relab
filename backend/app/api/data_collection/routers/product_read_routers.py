"""Read-focused routers for product and component endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated

from fastapi import HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from fastapi_pagination.links import Page
from pydantic import UUID4, PositiveInt
from sqlalchemy import select

from app.api.auth.dependencies import CurrentActiveUserDep, OptionalCurrentActiveUserDep
from app.api.auth.models import User
from app.api.auth.services.privacy import redact_product_owner
from app.api.background_data.routers.public import RecursionDepthQueryParam
from app.api.common.crud.query import list_models, page_models, require_model
from app.api.common.crud.scopes import require_scoped_model
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.common.schemas.base import ProductRead
from app.api.data_collection import crud
from app.api.data_collection.dependencies import ProductFilterWithRelationshipsDep
from app.api.data_collection.models.product import Product
from app.api.data_collection.schemas import (
    ComponentReadWithRecursiveComponents,
    ProductReadWithRecursiveComponents,
    ProductReadWithRelationshipsAndFlatComponents,
)
from app.api.data_collection.validators import ProductValidationError, validate_product

if TYPE_CHECKING:
    from collections.abc import Sequence

    from sqlalchemy import Select

user_product_redirect_router = PublicAPIRouter(prefix="/users/me/products", tags=["products"])
user_product_router = PublicAPIRouter(prefix="/users/{user_id}/products", tags=["products"])
product_read_router = PublicAPIRouter(prefix="/products", tags=["products"])

type IncludeComponentsAsBaseProductsQueryParam = Annotated[
    bool | None,
    Query(description="Whether to include components as base products in the response"),
]


def convert_components_to_read_model(
    components: list[Product], owner: User | None, max_depth: int = 1, current_depth: int = 0
) -> list[ComponentReadWithRecursiveComponents]:
    """Convert component ORM rows to the recursive read schema."""
    if current_depth >= max_depth:
        return []

    read_components: list[ComponentReadWithRecursiveComponents] = []
    for component in components:
        assign_shared_owner_tree(component, owner)
        read_components.append(
            ComponentReadWithRecursiveComponents.model_validate(component).model_copy(
                update={
                    "components": convert_components_to_read_model(
                        component.components or [], owner, max_depth, current_depth + 1
                    )
                }
            )
        )
    return read_components


def redact_product_owners(products: list[Product], current_user: User | None) -> None:
    """Apply owner privacy redaction to paginated products in place."""
    for product in products:
        redact_product_owner(product, current_user)


def assign_shared_owner(product: Product, owner: User | None) -> None:
    """Assign the same owner to a single product row."""
    product.owner = owner
    product.owner_id = owner.id if owner else None


def assign_owner_to_components(components: list[Product], owner: User | None) -> None:
    """Assign the shared owner to direct component rows only."""
    for component in components:
        assign_shared_owner(component, owner)


def assign_shared_owner_tree(product: Product, owner: User | None) -> None:
    """Assign the same owner to a product and all loaded descendants."""
    assign_shared_owner(product, owner)
    for component in product.components or []:
        assign_shared_owner_tree(component, owner)


async def load_product_tree_for_validation(
    session: AsyncSessionDep,
    product: Product,
    *,
    visited: set[int] | None = None,
) -> None:
    """Explicitly load the product tree needed for validation."""
    visited = visited or set()
    if product.id in visited:
        return
    visited.add(product.id)

    await session.refresh(product, attribute_names=["components", "bill_of_materials"])
    for component in product.components or []:
        await load_product_tree_for_validation(session, component, visited=visited)


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
    response_model=Page[ProductRead],
    summary="Get products collected by a user",
)
async def get_user_products(
    user_id: UUID4,
    session: AsyncSessionDep,
    current_user: CurrentActiveUserDep,
    product_filter: ProductFilterWithRelationshipsDep,
    *,
    include_components_as_base_products: IncludeComponentsAsBaseProductsQueryParam = None,
) -> Page[Product]:
    """Get products collected by a specific user."""
    if user_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized to view this user's products")

    statement = select(Product).where(Product.owner_id == user_id)
    if not include_components_as_base_products:
        statement = statement.where(Product.parent_id.is_(None))

    return await page_models(
        session,
        Product,
        loaders=crud.PRODUCT_READ_SUMMARY_RELATIONSHIPS,
        filters=product_filter,
        statement=statement,
        mutate_items=lambda items: redact_product_owners(items, current_user),
    )


@product_read_router.get(
    "",
    response_model=Page[ProductRead],
    summary="Get all products",
)
async def get_products(
    session: AsyncSessionDep,
    current_user: OptionalCurrentActiveUserDep,
    product_filter: ProductFilterWithRelationshipsDep,
    *,
    include_components_as_base_products: IncludeComponentsAsBaseProductsQueryParam = None,
) -> Page[Product]:
    """Get all products."""
    if include_components_as_base_products:
        statement: Select[tuple[Product]] = select(Product)
    else:
        statement = select(Product).where(Product.parent_id.is_(None))

    return await page_models(
        session,
        Product,
        loaders=crud.PRODUCT_READ_SUMMARY_RELATIONSHIPS,
        filters=product_filter,
        statement=statement,
        mutate_items=lambda items: redact_product_owners(items, current_user),
    )


@product_read_router.get(
    "/tree",
    response_model=list[ProductReadWithRecursiveComponents],
    summary="Get products tree",
)
async def get_products_tree(
    session: AsyncSessionDep,
    current_user: OptionalCurrentActiveUserDep,
    product_filter: ProductFilterWithRelationshipsDep,
    recursion_depth: RecursionDepthQueryParam = 1,
) -> list[ProductReadWithRecursiveComponents]:
    """Get all base products and their components in a tree structure."""
    products: Sequence[Product] = await crud.get_product_trees(
        session, recursion_depth=recursion_depth, product_filter=product_filter
    )
    for product in products:
        redact_product_owner(product, current_user)
        assign_shared_owner_tree(product, product.owner)

    return [
        ProductReadWithRecursiveComponents.model_validate(product).model_copy(
            update={
                "components": convert_components_to_read_model(
                    product.components or [], product.owner, max_depth=recursion_depth - 1
                )
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
    current_user: OptionalCurrentActiveUserDep,
    product_id: PositiveInt,
) -> ProductReadWithRelationshipsAndFlatComponents:
    """Get product by ID."""
    product: Product = await require_model(
        session,
        Product,
        product_id,
        loaders=crud.PRODUCT_READ_DETAIL_RELATIONSHIPS,
    )
    redact_product_owner(product, current_user)
    return ProductReadWithRelationshipsAndFlatComponents.model_validate(product)


@product_read_router.get(
    "/{product_id}/components/tree",
    summary="Get product component subtree",
    response_model=list[ComponentReadWithRecursiveComponents],
)
async def get_product_subtree(
    session: AsyncSessionDep,
    current_user: OptionalCurrentActiveUserDep,
    product_id: PositiveInt,
    product_filter: ProductFilterWithRelationshipsDep,
    recursion_depth: RecursionDepthQueryParam = 1,
) -> list[ComponentReadWithRecursiveComponents]:
    """Get a product's components in a tree structure, up to a specified depth."""
    parent_product: Product = await require_model(
        session,
        Product,
        product_id,
        loaders=crud.PRODUCT_READ_SUMMARY_RELATIONSHIPS,
    )
    redact_product_owner(parent_product, current_user)

    products: Sequence[Product] = await crud.get_product_trees(
        session, recursion_depth=recursion_depth, parent_id=product_id, product_filter=product_filter
    )
    for product in products:
        assign_shared_owner_tree(product, parent_product.owner)

    return [
        ComponentReadWithRecursiveComponents.model_validate(product).model_copy(
            update={
                "components": convert_components_to_read_model(
                    product.components or [], parent_product.owner, max_depth=recursion_depth - 1
                )
            }
        )
        for product in products
    ]


@product_read_router.get(
    "/{product_id}/components",
    response_model=list[ProductRead],
    summary="Get product components",
)
async def get_product_components(
    session: AsyncSessionDep,
    current_user: OptionalCurrentActiveUserDep,
    product_id: PositiveInt,
    product_filter: ProductFilterWithRelationshipsDep,
) -> list[ProductRead]:
    """Get all components of a product."""
    parent_product = await require_model(
        session,
        Product,
        product_id,
        loaders=crud.PRODUCT_READ_SUMMARY_RELATIONSHIPS,
    )
    products: Sequence[Product] = await list_models(
        session,
        Product,
        loaders=crud.PRODUCT_READ_SUMMARY_RELATIONSHIPS,
        filters=product_filter,
        statement=select(Product).where(Product.parent_id == product_id),
    )
    redact_product_owner(parent_product, current_user)
    for p in products:
        assign_shared_owner(p, parent_product.owner)

    return [ProductRead.model_validate(p) for p in products]


@product_read_router.get(
    "/{product_id}/components/{component_id}",
    response_model=ProductReadWithRelationshipsAndFlatComponents,
    summary="Get product component by ID",
)
async def get_product_component(
    product_id: PositiveInt,
    component_id: PositiveInt,
    *,
    session: AsyncSessionDep,
    current_user: OptionalCurrentActiveUserDep,
) -> ProductReadWithRelationshipsAndFlatComponents:
    """Get component by ID."""
    product: Product = await require_scoped_model(
        session,
        Product,
        product_id,
        Product,
        component_id,
        "parent_id",
        loaders=crud.PRODUCT_READ_DETAIL_RELATIONSHIPS,
    )
    parent_product = await require_model(
        session,
        Product,
        product_id,
        loaders=crud.PRODUCT_READ_SUMMARY_RELATIONSHIPS,
    )
    redact_product_owner(parent_product, current_user)
    assign_shared_owner(product, parent_product.owner)
    assign_owner_to_components(product.components or [], parent_product.owner)
    return ProductReadWithRelationshipsAndFlatComponents.model_validate(product)


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
    product = await require_model(session, Product, product_id)
    await load_product_tree_for_validation(session, product)
    try:
        validate_product(product)
    except ProductValidationError as exc:
        return {"valid": False, "errors": [exc.public_message]}
    except ValueError:
        return {"valid": False, "errors": ["Product failed validation."]}
    return {"valid": True, "errors": []}
