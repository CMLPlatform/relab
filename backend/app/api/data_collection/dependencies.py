"""Router dependencies for data collection routers."""

import re
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Path
from pydantic import PositiveInt

from app.api.auth.dependencies import CurrentActiveVerifiedUserDep
from app.api.common.audit import AuditAction, audit_event
from app.api.common.crud.filtering import create_filter_dependency
from app.api.common.crud.query import require_model
from app.api.common.ownership import get_user_owned_object
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.data_collection.exceptions import ProductVersionMismatchError
from app.api.data_collection.filters import MaterialProductLinkFilter, ProductFilterWithRelationships
from app.api.data_collection.models.product import Product

### Query filters ###
MaterialProductLinkFilterDep = Annotated[
    MaterialProductLinkFilter, Depends(create_filter_dependency(MaterialProductLinkFilter))
]
ProductFilterWithRelationshipsDep = Annotated[
    ProductFilterWithRelationships, Depends(create_filter_dependency(ProductFilterWithRelationships))
]


### Optimistic concurrency ###
def product_if_match_version(
    if_match: Annotated[
        str,
        Header(
            description='The `version` field from the product\'s last read, quoted: `"3"`. '
            "Not the `ETag` a GET returns: that one also changes with media. "
            "A stale or malformed value is refused with 412.",
        ),
    ],
) -> int:
    """Parse the required ``If-Match: "<version>"`` header on product updates."""
    match = re.fullmatch(r'"([0-9]{1,9})"', if_match.strip())
    if match is None:
        raise ProductVersionMismatchError
    return int(match.group(1))


ProductIfMatchVersionDep = Annotated[int, Depends(product_if_match_version)]


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
    *,
    allow_moderation: bool = False,
) -> Product:
    """Fetch a product the current user owns. Owner_id is denormalized on every row, so this is O(1).

    With ``allow_moderation``, a superuser may also act on someone else's product. That
    covers correcting the record and deleting it or its media, never adding content. The
    bypass needs MFA enrolled on the superuser account: acting on anyone's data must not
    rest on a password alone. A superuser without MFA is treated like any other user.
    """
    if allow_moderation and current_user.has_admin_access:
        audit_event(current_user.id, AuditAction.SUPERUSER_ACCESS, Product, item_id)
        return await require_model(session, Product, item_id)
    return await get_user_owned_object(session, Product, item_id, current_user.id)


def _require_base_product(product: Product) -> Product:
    if not product.is_base_product:
        raise HTTPException(status_code=404, detail="Product is a component; use /components/{id} instead.")
    return product


def _require_component(product: Product) -> Product:
    if product.is_base_product:
        raise HTTPException(
            status_code=404,
            detail=f"ID {product.id} belongs to a base product; use /products/{{id}} instead.",
        )
    return product


async def get_user_owned_base_product(
    product_id: Annotated[PositiveInt, Path()],
    session: AsyncSessionDep,
    current_user: CurrentActiveVerifiedUserDep,
) -> Product:
    """Resolve a base product owned by the current user; 404s for components."""
    return _require_base_product(await _fetch_owned_product(session, product_id, current_user))


UserOwnedBaseProductDep = Annotated[Product, Depends(get_user_owned_base_product)]


async def get_moderatable_base_product(
    product_id: Annotated[PositiveInt, Path()],
    session: AsyncSessionDep,
    current_user: CurrentActiveVerifiedUserDep,
) -> Product:
    """Resolve a base product the current user owns or may moderate (MFA superuser, audited)."""
    return _require_base_product(await _fetch_owned_product(session, product_id, current_user, allow_moderation=True))


ModeratableBaseProductDep = Annotated[Product, Depends(get_moderatable_base_product)]


async def get_user_owned_component(
    component_id: Annotated[PositiveInt, Path()],
    session: AsyncSessionDep,
    current_user: CurrentActiveVerifiedUserDep,
) -> Product:
    """Resolve a component owned by the current user; 404s for base products."""
    return _require_component(await _fetch_owned_product(session, component_id, current_user))


UserOwnedComponentDep = Annotated[Product, Depends(get_user_owned_component)]


async def get_moderatable_component(
    component_id: Annotated[PositiveInt, Path()],
    session: AsyncSessionDep,
    current_user: CurrentActiveVerifiedUserDep,
) -> Product:
    """Resolve a component the current user owns or may moderate (MFA superuser, audited)."""
    return _require_component(await _fetch_owned_product(session, component_id, current_user, allow_moderation=True))


ModeratableComponentDep = Annotated[Product, Depends(get_moderatable_component)]
