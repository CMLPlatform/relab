"""Routers for data collection models.

Route modules stay flat and explicit by public resource:

- ``product_read_routers``: base-product reads and product-scoped component reads.
- ``product_mutation_routers``: base-product mutations and product-scoped component creation.
- ``product_related_routers``: base-product-only associated resources such as videos/materials.
- ``component_routers``: stable component routes and component-scoped associated resources.

Shared route bodies live in small ``*_handlers`` modules so product and component
routers can expose distinct URLs/OpenAPI copy without duplicating CRUD logic.
"""

from typing import (  # Runtime import is required for FastAPI/Pydantic endpoint annotations
    Annotated,
    Literal,
)

from fastapi import APIRouter, Query
from fastapi_pagination.links import Page

from app.api.common.crud.pagination import paginate_select
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.data_collection.filters import (
    get_brand_search_statement,
    get_model_search_statement,
    get_product_facet_statement,
)
from app.api.data_collection.routers.component_routers import component_router
from app.api.data_collection.routers.product_mutation_routers import product_mutation_router
from app.api.data_collection.routers.product_read_routers import (
    product_read_router,
    user_product_router,
)
from app.api.data_collection.routers.product_related_routers import product_related_router
from app.api.data_collection.schemas import ProductFacetsRead, ProductFacetValue
from app.core.cache import cache

# Initialize API router
router = APIRouter()


### Ancillary Search Routers ###

search_router = PublicAPIRouter(prefix="", include_in_schema=True)
ProductFacetField = Literal["brand", "model"]
PRODUCT_FACET_BRAND: ProductFacetField = "brand"


@search_router.get(
    "/products/suggestions/brands",
    response_model=Page[str],
    summary="Get product brand suggestions",
)
@cache(expire=60)
async def get_brand_suggestions(
    session: AsyncSessionDep,
    search: Annotated[str | None, Query(description="Search brand (case-insensitive)")] = None,
    order: Annotated[Literal["asc", "desc"], Query(description="Sort order: 'asc' or 'desc'")] = "asc",
) -> Page[str]:
    """Get a paginated, searchable list of unique product brands derived from product data."""
    statement = get_brand_search_statement(search=search, order=order)
    page = await paginate_select(session, statement)
    page.items = [brand.title() for brand in page.items if brand]
    return page


@search_router.get(
    "/products/suggestions/models",
    response_model=Page[str],
    summary="Get product model suggestions",
)
@cache(expire=60)
async def get_model_suggestions(
    session: AsyncSessionDep,
    search: Annotated[str | None, Query(description="Search model name (case-insensitive)")] = None,
    order: Annotated[Literal["asc", "desc"], Query(description="Sort order: 'asc' or 'desc'")] = "asc",
) -> Page[str]:
    """Get a paginated, searchable list of unique product model names derived from product data."""
    statement = get_model_search_statement(search=search, order=order)
    page = await paginate_select(session, statement)
    page.items = [model for model in page.items if model]
    return page


@search_router.get(
    "/products/facets",
    response_model=ProductFacetsRead,
    summary="Get derived product facets",
)
@cache(expire=60)
async def get_product_facets(
    session: AsyncSessionDep,
    fields: Annotated[
        list[ProductFacetField] | None,
        Query(description="Product fields to facet. Repeat the parameter for multiple fields."),
    ] = None,
) -> ProductFacetsRead:
    """Return derived filter values and counts for product browsing."""
    facets: ProductFacetsRead = {}
    for field in fields or [PRODUCT_FACET_BRAND]:
        rows = (await session.execute(get_product_facet_statement(field))).all()
        facets[field] = [
            ProductFacetValue(value=value.title() if field == PRODUCT_FACET_BRAND else value, count=count)
            for value, count in rows
            if value
        ]
    return facets


### Router inclusion ###
router.include_router(search_router)
router.include_router(user_product_router)
router.include_router(product_read_router)
router.include_router(product_mutation_router)
router.include_router(component_router)
router.include_router(product_related_router)
