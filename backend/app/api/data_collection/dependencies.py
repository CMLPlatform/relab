"""Router dependencies for data collection routers."""

from typing import Annotated

from fastapi import Depends, Path
from fastapi_filter import FilterDepends
from pydantic import PositiveInt

from app.api.auth.dependencies import CurrentActiveVerifiedUserDep
from app.api.auth.exceptions import UserOwnershipError
from app.api.common.crud.utils import get_model_or_404
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.data_collection.filters import MaterialProductLinkFilter, ProductFilterWithRelationships
from app.api.data_collection.models import Product

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
    return await get_model_or_404(session, Product, product_id)


ProductByIDDep = Annotated[Product, Depends(get_product_by_id)]


async def get_user_owned_product(
    product: ProductByIDDep,
    current_user: CurrentActiveVerifiedUserDep,
) -> Product:
    """Verify that the current user owns the specified product."""
    if product.owner_id == current_user.db_id or current_user.is_superuser:
        return product
    raise UserOwnershipError(model_type=Product, model_id=product.id, user_id=current_user.db_id) from None


UserOwnedProductDep = Annotated[Product, Depends(get_user_owned_product)]


async def get_user_owned_product_id(user_owned_product: UserOwnedProductDep) -> int | None:
    """Get the ID of a user owned product."""
    return user_owned_product.id
