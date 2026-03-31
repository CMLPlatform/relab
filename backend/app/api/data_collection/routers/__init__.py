"""Routers for data collection models."""

from typing import TYPE_CHECKING, Annotated, Literal, cast

from fastapi import APIRouter, Query
from fastapi_pagination.links import Page

from app.api.common.crud.base import paginate_with_exec
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.data_collection.filters import get_brand_search_statement
from app.api.data_collection.routers.product_mutation_routers import product_mutation_router
from app.api.data_collection.routers.product_read_routers import (
    product_read_router,
    user_product_redirect_router,
    user_product_router,
)
from app.api.data_collection.routers.product_related_routers import product_related_router
from app.core.cache import cache

if TYPE_CHECKING:
    from sqlmodel.sql._expression_select_cls import SelectOfScalar

# Initialize API router
router = APIRouter()


### Ancillary Search Routers ###

search_router = PublicAPIRouter(prefix="", include_in_schema=True)


@search_router.get(
    "/brands",
    response_model=Page[str],
    summary="Get paginated list of unique product brands",
)
@cache(expire=60)
async def get_brands(
    session: AsyncSessionDep,
    search: Annotated[str | None, Query(description="Search brand (case-insensitive)")] = None,
    order: Annotated[Literal["asc", "desc"], Query(description="Sort order: 'asc' or 'desc'")] = "asc",
) -> Page[str]:
    """Get a paginated, searchable and orderable list of unique product brands."""
    statement = get_brand_search_statement(search=search, order=order)
    page = await paginate_with_exec(session, cast("SelectOfScalar[str]", statement))
    page.items = [brand.title() for brand in page.items if brand]
    return cast("Page[str]", page)


### Router inclusion ###
router.include_router(user_product_redirect_router)
router.include_router(user_product_router)
router.include_router(product_read_router)
router.include_router(product_mutation_router)
router.include_router(product_related_router)
router.include_router(search_router)
