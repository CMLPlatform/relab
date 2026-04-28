"""Router dependencies for data collection routers."""

from typing import Annotated

from fastapi import Depends, HTTPException, Path
from fastapi_filter import FilterDepends
from pydantic import PositiveInt

from app.api.auth.dependencies import CurrentActiveVerifiedUserDep
from app.api.common.crud.query import require_model
from app.api.common.ownership import get_user_owned_object
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.data_collection.filters import MaterialProductLinkFilter, ProductFilterWithRelationships
from app.api.data_collection.models.product import Product

### FastAPI-Filters ###
MaterialProductLinkFilterDep = Annotated[MaterialProductLinkFilter, FilterDepends(MaterialProductLinkFilter)]
ProductFilterWithRelationshipsDep = Annotated[
    ProductFilterWithRelationships, FilterDepends(ProductFilterWithRelationships)
]


### Product Dependencies ###
async def get_product_by_id(
    product_id: Annotated[PositiveInt, Path()],
    session: AsyncSessionDep,
) -> Product:
    """Verify that a product with a given ID exists."""
    return await require_model(session, Product, product_id)


ProductByIDDep = Annotated[Product, Depends(get_product_by_id)]


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
    product = (
        await require_model(session, Product, component_id)
        if current_user.is_superuser
        else await get_user_owned_object(session, Product, component_id, current_user.id)
    )
    if product.is_base_product:
        raise HTTPException(
            status_code=404,
            detail=f"ID {component_id} belongs to a base product; use /products/{{id}} instead.",
        )
    return product


UserOwnedComponentDep = Annotated[Product, Depends(get_user_owned_component)]


async def get_user_owned_product_id(user_owned_product: UserOwnedProductDep) -> int | None:
    """Get the ID of a user owned product."""
    return user_owned_product.id


async def get_user_owned_base_product_id(base_product: UserOwnedBaseProductDep) -> int:
    """ID dep for product-scoped media routes (upload/delete under /products/{id})."""
    return base_product.id


async def get_user_owned_component_id_from_component(component: UserOwnedComponentDep) -> int:
    """ID dep for component-scoped media routes (upload/delete under /components/{id})."""
    return component.id
