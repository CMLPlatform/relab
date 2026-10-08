"""Read-focused routers for product and component endpoints."""

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Annotated, Any, Literal, cast

from fastapi import HTTPException, Query, Request
from fastapi_pagination.links import Page
from pydantic import UUID4, PositiveInt, TypeAdapter
from sqlalchemy import select
from starlette.responses import Response  # Runtime annotation evaluation needs this.

from app.api.auth.dependencies import CurrentActiveUserDep, OptionalCurrentActiveUserDep
from app.api.auth.models import User
from app.api.auth.schemas import normalize_username
from app.api.auth.services.privacy import can_view_profile
from app.api.auth.services.rate_limiter import API_EXPORT_RATE_LIMIT_DEPENDENCY, API_READ_RATE_LIMIT_DEPENDENCY
from app.api.common.audiences import PublicAPIRouter
from app.api.common.crud.filtering import apply_filter
from app.api.common.crud.loading import apply_loader_profile
from app.api.common.crud.pagination import paginate_select
from app.api.common.crud.query import require_model
from app.api.common.exceptions import BadRequestError
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.validation import MAX_QUERY_TEXT_LENGTH
from app.api.data_collection.crud.product_tree_queries import (
    COMPONENT_TREE_MAX_COMPONENTS,
    EXPORT_MAX_BASE_PRODUCTS,
    EXPORT_MAX_COMPONENTS,
    MAX_COMPONENT_DEPTH,
    PRODUCT_EXPORT_RELATIONSHIPS,
    PRODUCT_READ_SUMMARY_RELATIONSHIPS,
    apply_product_detail_loaders,
    load_all_descendants,
    load_component_subtree,
    require_product_detail,
)
from app.api.data_collection.dependencies import ProductFilterWithRelationshipsDep
from app.api.data_collection.filters import (
    get_brand_search_statement,
    get_model_search_statement,
    get_product_facet_statement,
)
from app.api.data_collection.models.product import Product
from app.api.data_collection.presentation.product_export import build_product_exports, render_products_csv
from app.api.data_collection.presentation.product_reads import (
    render_component_tree,
    to_read_model,
)
from app.api.data_collection.product_schemas import ProductRead
from app.api.data_collection.schemas import (
    ComponentRead,
    ComponentReadWithRecursiveComponents,
    ProductExportRead,
    ProductFacetsRead,
    ProductFacetValue,
    ProductReadWithRelationshipsAndFlatComponents,
)
from app.api.reference_data.routers.public_support import RecursionDepthQueryParam
from app.core.cache import cache
from app.core.responses import conditional_json_response

if TYPE_CHECKING:
    from collections.abc import Sequence

    from sqlalchemy import Select

user_product_router = PublicAPIRouter(prefix="/users/{user_id}/products", tags=["products"])
product_read_router = PublicAPIRouter(prefix="/products", tags=["products"])
CURRENT_USER_OWNER = "me"
ProductFacetField = Literal["brand", "model"]
PRODUCT_FACET_BRAND: ProductFacetField = "brand"
ExportFormat = Literal["csv", "json"]
EXPORT_FORMAT_CSV: ExportFormat = "csv"
ExportFormatQuery = Annotated[ExportFormat, Query(alias="format", description="File format: 'csv' or 'json'")]
OwnerQuery = Annotated[
    str | None,
    Query(
        max_length=50,
        description="Use 'me' for the current user's products, or a username for that user's public products",
    ),
]
_EXPORT_TOO_LARGE = (
    f"the export is too large (components nested more than {MAX_COMPONENT_DEPTH} levels deep, "
    f"or more than {EXPORT_MAX_COMPONENTS:,} components)"
)
_EXPORT_200: dict[str, Any] = {"content": {"text/csv": {"schema": {"type": "string"}}}}


async def _require_product_summary(session: AsyncSessionDep, product_id: PositiveInt) -> Product:
    """Load one product with the summary relationships used on collection reads."""
    return await require_model(session, Product, product_id, loaders=PRODUCT_READ_SUMMARY_RELATIONSHIPS)


async def _page_products[ReadT: ProductRead | ComponentRead](
    session: AsyncSessionDep,
    *,
    statement: Select[tuple[Product]],
    product_filter: ProductFilterWithRelationshipsDep,
    viewer: OptionalCurrentActiveUserDep,
    schema: type[ReadT],
) -> Page[ReadT]:
    """Page products or components through ``schema``, applying per-owner privacy redaction."""
    statement = apply_filter(statement, product_filter)
    statement = apply_loader_profile(statement, Product, PRODUCT_READ_SUMMARY_RELATIONSHIPS)
    page = await paginate_select(
        session,
        statement,
        model=Product,
        transform=lambda rows: [to_read_model(r, schema, viewer) for r in rows],
    )
    return cast("Page[ReadT]", page)


async def resolve_owner_id(session: AsyncSessionDep, owner: str, viewer: User | None) -> UUID4:
    """Map the ``owner`` query value to a user id: ``me`` or a username.

    Usernames follow the public-profile rule (``can_view_profile``): a hidden or
    unknown owner is a 404, so the list leaks nothing the profile would not.
    """
    if owner == CURRENT_USER_OWNER:
        if viewer is None:
            raise HTTPException(status_code=401, detail="Authentication required")
        return viewer.id
    lookup_username = cast("str", normalize_username(owner))
    user = (await session.execute(select(User).where(User.username == lookup_username))).unique().scalar_one_or_none()
    if user is None or not can_view_profile(user, viewer):
        raise HTTPException(status_code=404, detail="Profile not found")
    return user.id


async def _export_response(
    session: AsyncSessionDep,
    roots: Sequence[Product],
    viewer: User | None,
    export_format: ExportFormat,
    filename_stem: str,
) -> Response:
    """Load the component trees under ``roots`` and render them as a download."""
    children_by_parent_id = await load_all_descendants(session, [root.id for root in roots])
    products = build_product_exports(roots, children_by_parent_id, viewer)
    filename = f"{filename_stem}-{datetime.now(UTC):%Y%m%d}.{export_format}"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    if export_format == EXPORT_FORMAT_CSV:
        return Response(render_products_csv(products), media_type="text/csv; charset=utf-8", headers=headers)
    body = TypeAdapter(list[ProductExportRead]).dump_json(products)
    return Response(body, media_type="application/json", headers=headers)


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
    if user_id != current_user.id and not current_user.has_admin_access:
        raise HTTPException(status_code=403, detail="Not authorized to view this user's products")

    statement = select(Product).where(Product.owner_id == user_id, Product.parent_id.is_(None))
    payload = await _page_products(
        session,
        statement=statement,
        product_filter=product_filter,
        viewer=current_user,
        schema=ProductRead,
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
    owner: OwnerQuery = None,
) -> Page[ProductRead] | Response:
    """Get all base products. Components live under ``/products/{id}/components``."""
    statement: Select[tuple[Product]] = select(Product).where(Product.parent_id.is_(None))
    if owner is not None:
        statement = statement.where(Product.owner_id == await resolve_owner_id(session, owner, current_user))
    payload = await _page_products(
        session,
        statement=statement,
        product_filter=product_filter,
        viewer=current_user,
        schema=ProductRead,
    )
    return conditional_json_response(request, payload)


# Declared before "/{product_id}" so the single-segment static path wins over the dynamic param.
@product_read_router.get(
    "/export",
    response_model=list[ProductExportRead],
    responses={
        200: _EXPORT_200,
        400: {"description": f"More than {EXPORT_MAX_BASE_PRODUCTS} base products match, or {_EXPORT_TOO_LARGE}"},
    },
    summary="Export base products matching the list filters, with their components",
    dependencies=[API_EXPORT_RATE_LIMIT_DEPENDENCY],
)
async def export_products(
    session: AsyncSessionDep,
    current_user: OptionalCurrentActiveUserDep,
    product_filter: ProductFilterWithRelationshipsDep,
    export_format: ExportFormatQuery = EXPORT_FORMAT_CSV,
    owner: OwnerQuery = None,
) -> Response:
    """Export every base product the product list would match, each with its whole component tree.

    Takes the same filters, search and sorting as ``GET /products``. CSV has one row per
    product or component, linked by ``parent_id``; JSON nests components as the detail read
    does. At most 100 base products, 5,000 components and 10 component levels: narrow the filters,
    or use the dataset release for bulk data.
    """
    statement: Select[tuple[Product]] = select(Product).where(Product.parent_id.is_(None))
    if owner is not None:
        statement = statement.where(Product.owner_id == await resolve_owner_id(session, owner, current_user))
    statement = apply_product_detail_loaders(apply_filter(statement, product_filter), PRODUCT_EXPORT_RELATIONSHIPS)
    # One row past the cap tells "too many" apart without a separate count query.
    statement = statement.order_by(Product.id).limit(EXPORT_MAX_BASE_PRODUCTS + 1)
    roots = list((await session.execute(statement)).scalars().unique().all())
    if len(roots) > EXPORT_MAX_BASE_PRODUCTS:
        msg = (
            f"More than {EXPORT_MAX_BASE_PRODUCTS} products match. Narrow the filters to export them, "
            "or use the dataset release for bulk data."
        )
        raise BadRequestError(msg)
    return await _export_response(session, roots, current_user, export_format, "relab-products")


@product_read_router.get(
    "/facets",
    response_model=ProductFacetsRead,
    summary="Get derived product facets",
    dependencies=[API_READ_RATE_LIMIT_DEPENDENCY],
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
    """Get a base product by ID. For components, use ``/components/{component_id}``."""
    product = await require_product_detail(session, product_id)
    if not product.is_base_product:
        raise HTTPException(
            status_code=404,
            detail="Product is a component; fetch it via /components/{component_id}.",
        )
    payload = to_read_model(product, ProductReadWithRelationshipsAndFlatComponents, current_user)
    return conditional_json_response(request, payload)


@product_read_router.get(
    "/{product_id}/export",
    response_model=list[ProductExportRead],
    responses={
        200: _EXPORT_200,
        400: {"description": _EXPORT_TOO_LARGE.capitalize()},
    },
    summary="Export one base product with its components",
    dependencies=[API_EXPORT_RATE_LIMIT_DEPENDENCY],
)
async def export_product(
    session: AsyncSessionDep,
    current_user: OptionalCurrentActiveUserDep,
    product_id: PositiveInt,
    export_format: ExportFormatQuery = EXPORT_FORMAT_CSV,
) -> Response:
    """Export one base product and its whole component tree, in the same formats as ``/products/export``."""
    statement = apply_product_detail_loaders(
        select(Product).where(Product.id == product_id, Product.parent_id.is_(None)), PRODUCT_EXPORT_RELATIONSHIPS
    )
    root = (await session.execute(statement)).scalars().unique().one_or_none()
    if root is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return await _export_response(session, [root], current_user, export_format, f"relab-product-{product_id}")


@product_read_router.get(
    "/{product_id}/components/tree",
    summary="Get product component subtree",
    response_model=list[ComponentReadWithRecursiveComponents],
    responses={400: {"description": f"More than {COMPONENT_TREE_MAX_COMPONENTS:,} components at the requested depth"}},
    dependencies=[API_READ_RATE_LIMIT_DEPENDENCY],
)
async def get_product_subtree(
    session: AsyncSessionDep,
    current_user: OptionalCurrentActiveUserDep,
    product_id: PositiveInt,
    product_filter: ProductFilterWithRelationshipsDep,
    recursion_depth: RecursionDepthQueryParam = 1,
) -> list[ComponentReadWithRecursiveComponents]:
    """Get a product's component subtree as a bounded hierarchical view.

    A tree with more components than the cap, across all levels, is a 400. Page through
    ``/components`` level by level, or use the export, for bigger products.
    """
    await _require_product_summary(session, product_id)
    tree_data = await load_component_subtree(
        session,
        parent_id=product_id,
        recursion_depth=recursion_depth,
        product_filter=product_filter,
        max_nodes=COMPONENT_TREE_MAX_COMPONENTS,
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
    response_model=Page[ComponentRead],
    summary="Get product components",
    dependencies=[API_READ_RATE_LIMIT_DEPENDENCY],
)
async def get_product_components(
    session: AsyncSessionDep,
    current_user: OptionalCurrentActiveUserDep,
    product_id: PositiveInt,
    product_filter: ProductFilterWithRelationshipsDep,
) -> Page[ComponentRead]:
    """Get a page of a product's direct components."""
    await _require_product_summary(session, product_id)
    return await _page_products(
        session,
        statement=select(Product).where(Product.parent_id == product_id),
        product_filter=product_filter,
        viewer=current_user,
        schema=ComponentRead,
    )


### Ancillary search/facet routes ###


@product_read_router.get(
    "/suggestions/brands",
    response_model=Page[str],
    summary="Get product brand suggestions",
    dependencies=[API_READ_RATE_LIMIT_DEPENDENCY],
)
@cache(expire=60)
async def get_brand_suggestions(
    session: AsyncSessionDep,
    search: Annotated[
        str | None,
        Query(description="Search brand (case-insensitive)", max_length=MAX_QUERY_TEXT_LENGTH),
    ] = None,
    order: Annotated[Literal["asc", "desc"], Query(description="Sort order: 'asc' or 'desc'")] = "asc",
) -> Page[str]:
    """Get a paginated, searchable list of unique product brands derived from product data."""
    statement = get_brand_search_statement(search=search, order=order)
    page = await paginate_select(session, statement)
    page.items = [brand.title() for brand in page.items if brand]
    return page


@product_read_router.get(
    "/suggestions/models",
    response_model=Page[str],
    summary="Get product model suggestions",
    dependencies=[API_READ_RATE_LIMIT_DEPENDENCY],
)
@cache(expire=60)
async def get_model_suggestions(
    session: AsyncSessionDep,
    search: Annotated[
        str | None,
        Query(description="Search model name (case-insensitive)", max_length=MAX_QUERY_TEXT_LENGTH),
    ] = None,
    order: Annotated[Literal["asc", "desc"], Query(description="Sort order: 'asc' or 'desc'")] = "asc",
) -> Page[str]:
    """Get a paginated, searchable list of unique product model names derived from product data."""
    statement = get_model_search_statement(search=search, order=order)
    page = await paginate_select(session, statement)
    page.items = [model for model in page.items if model]
    return page
