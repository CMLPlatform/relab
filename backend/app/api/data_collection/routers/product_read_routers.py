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
from app.api.auth.services.privacy import redact_product_owner, should_redact_owner
from app.api.background_data.routers.public import RecursionDepthQueryParam
from app.api.common.crud.exceptions import DependentModelOwnershipError
from app.api.common.crud.filtering import apply_filter
from app.api.common.crud.loading import apply_loader_profile
from app.api.common.crud.pagination import paginate_select
from app.api.common.crud.query import require_model
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.common.schemas.base import ProductRead
from app.api.data_collection.crud.products import (
    PRODUCT_READ_DETAIL_RELATIONSHIPS,
    PRODUCT_READ_SUMMARY_RELATIONSHIPS,
    load_product_tree_data,
)
from app.api.data_collection.dependencies import ProductFilterWithRelationshipsDep
from app.api.data_collection.models.product import Product
from app.api.data_collection.schemas import (
    ComponentReadWithRecursiveComponents,
    ProductReadWithRecursiveComponents,
    ProductReadWithRelationships,
    ProductReadWithRelationshipsAndFlatComponents,
)
from app.api.data_collection.validators import ProductValidationError, validate_product
from app.core.responses import conditional_json_response

if TYPE_CHECKING:
    from collections.abc import Sequence

    from sqlalchemy import Select
    from starlette.responses import Response

user_product_redirect_router = PublicAPIRouter(prefix="/users/me/products", tags=["products"])
user_product_router = PublicAPIRouter(prefix="/users/{user_id}/products", tags=["products"])
product_read_router = PublicAPIRouter(prefix="/products", tags=["products"])

type IncludeComponentsAsBaseProductsQueryParam = Annotated[
    bool | None,
    Query(description="Whether to include components as base products in the response"),
]


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


def _visible_owner(owner: User | None, viewer: User | None) -> User | None:
    """Return the owner when privacy rules allow it, otherwise ``None``."""
    if owner is None:
        return None
    if should_redact_owner(owner, viewer):
        return None
    return owner


def _product_owner_fields(owner: User | None) -> dict[str, str | UUID4 | None]:
    """Build public owner fields for product responses."""
    return {
        "owner_id": owner.id if owner else None,
        "owner_username": owner.username if owner else None,
    }


def _product_scalar_payload(
    product: Product,
    *,
    owner: User | None,
) -> dict[str, object]:
    """Build the scalar payload shared by product and component read schemas."""
    payload: dict[str, object] = {
        "id": product.id,
        "created_at": product.created_at,
        "updated_at": product.updated_at,
        "name": product.name,
        "description": product.description,
        "brand": product.brand,
        "model": product.model,
        "dismantling_notes": product.dismantling_notes,
        "dismantling_time_start": product.dismantling_time_start,
        "dismantling_time_end": product.dismantling_time_end,
        "product_type_id": product.product_type_id,
        "thumbnail_url": product.thumbnail_url,
        "parent_id": product.parent_id,
        "amount_in_parent": product.amount_in_parent,
        "weight_g": product.weight_g,
        "height_cm": product.height_cm,
        "width_cm": product.width_cm,
        "depth_cm": product.depth_cm,
        "volume_cm3": product.volume_cm3,
        "recyclability_observation": product.recyclability_observation,
        "recyclability_comment": product.recyclability_comment,
        "recyclability_reference": product.recyclability_reference,
        "repairability_observation": product.repairability_observation,
        "repairability_comment": product.repairability_comment,
        "repairability_reference": product.repairability_reference,
        "remanufacturability_observation": product.remanufacturability_observation,
        "remanufacturability_comment": product.remanufacturability_comment,
        "remanufacturability_reference": product.remanufacturability_reference,
    }
    payload.update(_product_owner_fields(owner))
    return payload


def _serialize_component_tree(
    product: Product,
    *,
    owner: User | None,
    children_by_parent_id: dict[int, list[Product]],
    max_depth: int,
    current_depth: int = 0,
    visited: set[int] | None = None,
) -> ComponentReadWithRecursiveComponents:
    """Serialize a component subtree from preloaded nodes without touching ORM relationships."""
    visited = visited or set()
    if product.id is None:
        child_components: list[ComponentReadWithRecursiveComponents] = []
    elif product.id in visited or current_depth >= max_depth:
        child_components = []
    else:
        next_visited = visited | {product.id}
        child_components = [
            _serialize_component_tree(
                child,
                owner=owner,
                children_by_parent_id=children_by_parent_id,
                max_depth=max_depth,
                current_depth=current_depth + 1,
                visited=next_visited,
            )
            for child in children_by_parent_id.get(product.id, [])
        ]

    return ComponentReadWithRecursiveComponents.model_validate(
        {
            **_product_scalar_payload(product, owner=owner),
            "components": child_components,
        }
    )


def _serialize_product_tree(
    product: Product,
    *,
    viewer: User | None,
    children_by_parent_id: dict[int, list[Product]],
    recursion_depth: int,
) -> ProductReadWithRecursiveComponents:
    """Serialize a root product plus its bounded child tree."""
    visible_owner = _visible_owner(product.owner, viewer)
    base = ProductReadWithRelationships.model_validate(product).model_dump()
    base.update(_product_owner_fields(visible_owner))
    components = [
        _serialize_component_tree(
            child,
            owner=visible_owner,
            children_by_parent_id=children_by_parent_id,
            max_depth=recursion_depth - 1,
            visited={product.id} if product.id is not None else None,
        )
        for child in ([] if product.id is None else children_by_parent_id.get(product.id, []))
    ]
    return ProductReadWithRecursiveComponents.model_validate({**base, "components": components})


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


async def _page_products(
    session: AsyncSessionDep,
    *,
    statement: Select[tuple[Product]],
    product_filter: ProductFilterWithRelationshipsDep,
    current_user: User | None,
) -> Page[Product]:
    """Page products from an explicit product read query."""
    statement = apply_filter(statement, Product, product_filter)
    statement = apply_loader_profile(statement, Product, PRODUCT_READ_SUMMARY_RELATIONSHIPS)
    return await paginate_select(
        session,
        statement,
        model=Product,
        mutate_items=lambda items: redact_product_owners(items, current_user),
    )


async def _load_product_component(
    session: AsyncSessionDep,
    *,
    product_id: PositiveInt,
    component_id: PositiveInt,
) -> Product:
    """Load one component scoped to a parent product."""
    await _require_product_summary(session, product_id)
    statement = select(Product).where(Product.id == component_id, Product.parent_id == product_id)
    statement = apply_loader_profile(statement, Product, PRODUCT_READ_DETAIL_RELATIONSHIPS)
    product = (await session.execute(statement)).scalars().unique().one_or_none()
    if product is not None:
        return product

    existing = await _require_product_detail(session, component_id)
    if existing.parent_id != product_id:
        raise DependentModelOwnershipError(Product, component_id, Product, product_id)
    return existing


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
    request: Request,
    user_id: UUID4,
    session: AsyncSessionDep,
    current_user: CurrentActiveUserDep,
    product_filter: ProductFilterWithRelationshipsDep,
    *,
    include_components_as_base_products: IncludeComponentsAsBaseProductsQueryParam = None,
) -> Page[Product] | Response:
    """Get products collected by a specific user."""
    if user_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized to view this user's products")

    statement = select(Product).where(Product.owner_id == user_id)
    if not include_components_as_base_products:
        statement = statement.where(Product.parent_id.is_(None))

    payload = await _page_products(
        session,
        statement=statement,
        product_filter=product_filter,
        current_user=current_user,
    )
    return conditional_json_response(request, payload)


@product_read_router.get(
    "",
    response_model=Page[ProductRead],
    summary="Get all products",
)
async def get_products(
    request: Request,
    session: AsyncSessionDep,
    current_user: OptionalCurrentActiveUserDep,
    product_filter: ProductFilterWithRelationshipsDep,
    *,
    include_components_as_base_products: IncludeComponentsAsBaseProductsQueryParam = None,
) -> Page[Product] | Response:
    """Get all products."""
    if include_components_as_base_products:
        statement: Select[tuple[Product]] = select(Product)
    else:
        statement = select(Product).where(Product.parent_id.is_(None))

    payload = await _page_products(
        session,
        statement=statement,
        product_filter=product_filter,
        current_user=current_user,
    )
    return conditional_json_response(request, payload)


@product_read_router.get(
    "/tree",
    response_model=list[ProductReadWithRecursiveComponents],
    summary="Get products tree",
)
async def get_products_tree(
    request: Request,
    session: AsyncSessionDep,
    current_user: OptionalCurrentActiveUserDep,
    product_filter: ProductFilterWithRelationshipsDep,
    recursion_depth: RecursionDepthQueryParam = 1,
) -> list[ProductReadWithRecursiveComponents] | Response:
    """Get all base products and their components as a bounded hierarchical view."""
    tree_data = await load_product_tree_data(session, recursion_depth=recursion_depth, product_filter=product_filter)
    payload = [
        _serialize_product_tree(
            product,
            viewer=current_user,
            children_by_parent_id=tree_data.children_by_parent_id,
            recursion_depth=recursion_depth,
        )
        for product in tree_data.roots
    ]
    return conditional_json_response(request, payload)


@product_read_router.get(
    "/{product_id}",
    response_model=ProductReadWithRelationshipsAndFlatComponents,
    summary="Get product by ID",
)
async def get_product(
    request: Request,
    session: AsyncSessionDep,
    current_user: OptionalCurrentActiveUserDep,
    product_id: PositiveInt,
) -> ProductReadWithRelationshipsAndFlatComponents | Response:
    """Get product by ID."""
    product = await _require_product_detail(session, product_id)
    redact_product_owner(product, current_user)
    payload = ProductReadWithRelationshipsAndFlatComponents.model_validate(product)
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
    parent_product = await _require_product_summary(session, product_id)
    visible_owner = _visible_owner(parent_product.owner, current_user)
    tree_data = await load_product_tree_data(
        session,
        recursion_depth=recursion_depth,
        parent_id=product_id,
        product_filter=product_filter,
    )
    return [
        _serialize_component_tree(
            product,
            owner=visible_owner,
            children_by_parent_id=tree_data.children_by_parent_id,
            max_depth=recursion_depth - 1,
            visited={product_id},
        )
        for product in tree_data.roots
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
    parent_product = await _require_product_summary(session, product_id)
    products = await _list_direct_components(session, product_id=product_id, product_filter=product_filter)
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
    product = await _load_product_component(session, product_id=product_id, component_id=component_id)
    parent_product = await _require_product_summary(session, product_id)
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
