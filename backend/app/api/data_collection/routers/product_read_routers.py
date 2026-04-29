"""Read-focused routers for product and component endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated, Literal, cast

from fastapi import HTTPException, Query, Request
from fastapi_pagination.links import Page
from pydantic import UUID4, PositiveInt
from sqlalchemy import select

from app.api.auth.dependencies import CurrentActiveUserDep, OptionalCurrentActiveUserDep
from app.api.common.crud.filtering import apply_filter
from app.api.common.crud.loading import apply_loader_profile
from app.api.common.crud.pagination import paginate_select
from app.api.common.crud.query import require_model
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.common.schemas.base import ComponentRead, ProductRead
from app.api.data_collection.crud.products import (
    PRODUCT_READ_DETAIL_RELATIONSHIPS,
    PRODUCT_READ_SUMMARY_RELATIONSHIPS,
    load_component_subtree,
)
from app.api.data_collection.dependencies import ProductFilterWithRelationshipsDep
from app.api.data_collection.models.product import Product
from app.api.data_collection.presentation.product_reads import (
    render_component_tree,
    to_component_reads,
    to_product_read,
    to_product_reads,
)
from app.api.data_collection.schemas import (
    ComponentReadWithRecursiveComponents,
    ProductReadWithRelationshipsAndFlatComponents,
)
from app.api.reference_data.routers.public import RecursionDepthQueryParam
from app.core.responses import conditional_json_response

if TYPE_CHECKING:
    from collections.abc import Sequence

    from sqlalchemy import Select
    from starlette.responses import Response

user_product_router = PublicAPIRouter(prefix="/users/{user_id}/products", tags=["products"])
product_read_router = PublicAPIRouter(prefix="/products", tags=["products"])
CURRENT_USER_OWNER = "me"


async def _require_product_summary(session: AsyncSessionDep, product_id: PositiveInt) -> Product:
    """Load one product with the summary relationships used on collection reads."""
    return await require_model(session, Product, product_id, loaders=PRODUCT_READ_SUMMARY_RELATIONSHIPS)


async def _require_product_detail(session: AsyncSessionDep, product_id: PositiveInt) -> Product:
    """Load one product with the detail relationships used on detail reads."""
    return await require_model(session, Product, product_id, loaders=PRODUCT_READ_DETAIL_RELATIONSHIPS)


async def _list_direct_components(
    session: AsyncSessionDep,
    *,
    product_id: PositiveInt,
    product_filter: ProductFilterWithRelationshipsDep,
) -> Sequence[Product]:
    """List direct child components for a product."""
    statement = select(Product).where(Product.parent_id == product_id)
    statement = apply_loader_profile(statement, Product, PRODUCT_READ_SUMMARY_RELATIONSHIPS)
    statement = apply_filter(statement, Product, product_filter)
    return list((await session.execute(statement)).scalars().unique().all())


async def _page_base_products(
    session: AsyncSessionDep,
    *,
    statement: Select[tuple[Product]],
    product_filter: ProductFilterWithRelationshipsDep,
    viewer: OptionalCurrentActiveUserDep,
) -> Page[ProductRead]:
    """Page base products through ProductRead, applying per-owner privacy redaction."""
    statement = apply_filter(statement, Product, product_filter)
    statement = apply_loader_profile(statement, Product, PRODUCT_READ_SUMMARY_RELATIONSHIPS)
    page = await paginate_select(
        session,
        statement,
        model=Product,
        transform=lambda rows: to_product_reads(rows, ProductRead, viewer),
    )
    return cast("Page[ProductRead]", page)


@user_product_router.get(
    "",
    response_model=Page[ProductRead],
    summary="Get base products collected by a user",
)
async def get_user_products(
    request: Request,
    user_id: UUID4,
    session: AsyncSessionDep,
    current_user: CurrentActiveUserDep,
    product_filter: ProductFilterWithRelationshipsDep,
) -> Page[ProductRead] | Response:
    """Get base products collected by a specific user."""
    if user_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized to view this user's products")

    statement = select(Product).where(Product.owner_id == user_id, Product.parent_id.is_(None))
    payload = await _page_base_products(
        session,
        statement=statement,
        product_filter=product_filter,
        viewer=current_user,
    )
    return conditional_json_response(request, payload)


@product_read_router.get(
    "",
    response_model=Page[ProductRead],
    summary="Get all base products",
)
async def get_products(
    request: Request,
    session: AsyncSessionDep,
    current_user: OptionalCurrentActiveUserDep,
    product_filter: ProductFilterWithRelationshipsDep,
    owner: Annotated[Literal["me"] | None, Query(description="Use 'me' to list the current user's products")] = None,
) -> Page[ProductRead] | Response:
    """Get all base products. Components live under ``/products/{id}/components``."""
    statement: Select[tuple[Product]] = select(Product).where(Product.parent_id.is_(None))
    if owner == CURRENT_USER_OWNER:
        if current_user is None:
            raise HTTPException(status_code=401, detail="Authentication required")
        statement = statement.where(Product.owner_id == current_user.id)
    payload = await _page_base_products(
        session,
        statement=statement,
        product_filter=product_filter,
        viewer=current_user,
    )
    return conditional_json_response(request, payload)


@product_read_router.get(
    "/{product_id}",
    response_model=ProductReadWithRelationshipsAndFlatComponents,
    summary="Get base product by ID",
)
async def get_product(
    request: Request,
    session: AsyncSessionDep,
    current_user: OptionalCurrentActiveUserDep,
    product_id: PositiveInt,
) -> ProductReadWithRelationshipsAndFlatComponents | Response:
    """Get a base product by ID. For components, use ``/products/{parent_id}/components/{component_id}``."""
    product = await _require_product_detail(session, product_id)
    if not product.is_base_product:
        raise HTTPException(
            status_code=404,
            detail="Product is a component; fetch it via /products/{parent_id}/components/{component_id}.",
        )
    payload = to_product_read(product, ProductReadWithRelationshipsAndFlatComponents, current_user)
    return conditional_json_response(request, payload)


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
    """Get a product's component subtree as a bounded hierarchical view."""
    await _require_product_summary(session, product_id)
    tree_data = await load_component_subtree(
        session,
        parent_id=product_id,
        recursion_depth=recursion_depth,
        product_filter=product_filter,
    )
    return render_component_tree(
        tree_data.roots,
        children_by_parent_id=tree_data.children_by_parent_id,
        max_depth=recursion_depth - 1,
        viewer=current_user,
        visited=frozenset({product_id}),
    )


@product_read_router.get(
    "/{product_id}/components",
    response_model=list[ComponentRead],
    summary="Get product components",
)
async def get_product_components(
    session: AsyncSessionDep,
    current_user: OptionalCurrentActiveUserDep,
    product_id: PositiveInt,
    product_filter: ProductFilterWithRelationshipsDep,
) -> list[ComponentRead]:
    """Get all direct components of a product."""
    await _require_product_summary(session, product_id)
    components = await _list_direct_components(session, product_id=product_id, product_filter=product_filter)
    return to_component_reads(list(components), ComponentRead, current_user)
