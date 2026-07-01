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


async def _fetch_owned_product(
    session: AsyncSessionDep,
    item_id: int,
    current_user: CurrentActiveVerifiedUserDep,
) -> Product:
    """Fetch a product with superuser bypass. Owner_id is denormalized on every row, so this is O(1)."""
    if current_user.is_superuser:
        audit_event(current_user.id, AuditAction.SUPERUSER_ACCESS, Product, item_id)
        return await require_model(session, Product, item_id)
    return await get_user_owned_object(session, Product, item_id, current_user.id)


async def get_user_owned_product(
    product_id: Annotated[PositiveInt, Path()],
    session: AsyncSessionDep,
    current_user: CurrentActiveVerifiedUserDep,
) -> Product:
    return await _fetch_owned_product(session, product_id, current_user)


UserOwnedProductDep = Annotated[Product, Depends(get_user_owned_product)]


async def get_user_owned_base_product(product: UserOwnedProductDep) -> Product:
    """Like :func:`get_user_owned_product` but 404s when the row is a component."""
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
    product = await _fetch_owned_product(session, component_id, current_user)
    if product.is_base_product:
        raise HTTPException(
            status_code=404,
            detail=f"ID {component_id} belongs to a base product; use /products/{{id}} instead.",
        )
    return product


UserOwnedComponentDep = Annotated[Product, Depends(get_user_owned_component)]


