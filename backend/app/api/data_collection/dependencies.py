"""Router dependencies for data collection routers."""

from typing import Annotated

from fastapi import Depends, HTTPException, Path
from pydantic import PositiveInt

from app.api.auth.dependencies import CurrentActiveVerifiedUserDep
from app.api.common.audit import AuditAction, audit_event
from app.api.common.crud.filtering import create_filter_dependency
from app.api.common.crud.query import require_model
from app.api.common.ownership import get_user_owned_object
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.data_collection.filters import MaterialProductLinkFilter, ProductFilterWithRelationships
from app.api.data_collection.models.product import Product

### Query filters ###
MaterialProductLinkFilterDep = Annotated[
    MaterialProductLinkFilter, Depends(create_filter_dependency(MaterialProductLinkFilter))
]
ProductFilterWithRelationshipsDep = Annotated[
    ProductFilterWithRelationships, Depends(create_filter_dependency(ProductFilterWithRelationships))
]


### Product Dependencies ###
async def get_product_by_id(
    product_id: Annotated[PositiveInt, Path()],
    session: AsyncSessionDep,
) -> Product:
    """Verify that a product with a given ID exists."""
    return await require_model(session, Product, product_id)


ProductByIDDep = Annotated[Product, Depends(get_product_by_id)]


async def get_base_product_by_id(product: ProductByIDDep) -> Product:
    """Resolve a public base-product route and reject component IDs."""
    if not product.is_base_product:
        raise HTTPException(status_code=404, detail="Product is a component; use /components/{id} instead.")
    return product


BaseProductDep = Annotated[Product, Depends(get_base_product_by_id)]


async def get_component_by_id(
    component_id: Annotated[PositiveInt, Path()],
    session: AsyncSessionDep,
) -> Product:
    """Resolve a public component route and reject base-product IDs."""
    product = await require_model(session, Product, component_id)
    if product.is_base_product:
        raise HTTPException(status_code=404, detail="ID belongs to a base product; use /products/{id} instead.")
    return product


ComponentDep = Annotated[Product, Depends(get_component_by_id)]


async def get_user_owned_product(
    product_id: Annotated[PositiveInt, Path()],
    session: AsyncSessionDep,
    current_user: CurrentActiveVerifiedUserDep,
) -> Product:
    """Verify that the current user owns the specified product.

    Components denormalize their root base product's ``owner_id``, so this is
    a single indexed lookup regardless of role.
    """
    if current_user.is_superuser:
        audit_event(current_user.id, AuditAction.SUPERUSER_ACCESS, Product, product_id)
        return await require_model(session, Product, product_id)
    return await get_user_owned_object(session, Product, product_id, current_user.id)


UserOwnedProductDep = Annotated[Product, Depends(get_user_owned_product)]


async def get_user_owned_base_product(product: UserOwnedProductDep) -> Product:
    """Like :func:`get_user_owned_product` but 404s when the row is a component.

    Used by ``/products/{id}`` routes so that component ids are rejected with a
    redirect hint to ``/components/{id}`` instead of silently accepted.
    """
    if not product.is_base_product:
        raise HTTPException(
            status_code=404,
            detail="Product is a component; use /components/{id} instead.",
        )
    return product


UserOwnedBaseProductDep = Annotated[Product, Depends(get_user_owned_base_product)]


async def get_user_owned_component(
    component_id: Annotated[PositiveInt, Path()],
    session: AsyncSessionDep,
    current_user: CurrentActiveVerifiedUserDep,
) -> Product:
    """Resolve ``/components/{component_id}`` and 404 when the id is a base product.

    Component rows denormalize their root's ``owner_id``, so ownership is an
    indexed single-row lookup regardless of tree depth.
    """
    if current_user.is_superuser:
        audit_event(current_user.id, AuditAction.SUPERUSER_ACCESS, Product, component_id)
        product = await require_model(session, Product, component_id)
    else:
        product = await get_user_owned_object(session, Product, component_id, current_user.id)
    if product.is_base_product:
        raise HTTPException(
            status_code=404,
            detail=f"ID {component_id} belongs to a base product; use /products/{{id}} instead.",
        )
    return product


UserOwnedComponentDep = Annotated[Product, Depends(get_user_owned_component)]


async def get_user_owned_base_product_id(base_product: UserOwnedBaseProductDep) -> int:
    """ID dep for product-scoped media routes (upload/delete under /products/{id})."""
    return base_product.id


async def get_user_owned_component_id_from_component(component: UserOwnedComponentDep) -> int:
    """ID dep for component-scoped media routes (upload/delete under /components/{id})."""
    return component.id
