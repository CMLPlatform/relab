"""Utilities for generating canonical and audience-filtered OpenAPI documentation."""

from types import MethodType
from typing import TYPE_CHECKING, Any, cast

from fastapi import APIRouter, FastAPI
from fastapi.openapi.utils import get_openapi
from fastapi.requests import Request
from fastapi.responses import Response
from fastapi.routing import APIRoute, RouteContext, iter_route_contexts

from app.api.common.audiences import RouteAudience, route_audiences
from app.core.responses import conditional_json_response

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence

    from starlette.routing import BaseRoute

__all__ = [
    "build_device_openapi",
    "build_public_openapi",
    "init_openapi_docs",
]

### Constants ###
API_CONTRACT_VERSION = "1.0.0"
API_MAJOR = "v1"

API_TITLE = "Relab - Data Collection API"
API_DESCRIPTION = (
    "Data collection app for the Relab project at CML.\n\n"
    "**Licensing.** This API specification is licensed Apache-2.0 so that anyone may write "
    "clients, importers, or integrations against it without inheriting the platform's "
    "copyleft. The Relab platform software itself remains AGPL-3.0-or-later, and curated "
    "dataset releases are licensed CC BY 4.0."
)
# Licence of the specification, not the software. Full text ships at LICENSE-APACHE-2.0
# in the repository root, as Apache-2.0 section 4(a) requires. Apache-2.0 rather than
# CC0 because the artifacts include generated client types and it carries a patent grant.
LICENSE_INFO = {"name": "Apache-2.0", "identifier": "Apache-2.0"}
ADMIN_TAG_GROUP: dict[str, str | list[str]] = {"name": "Admin", "tags": ["admin"]}
PUBLIC_TAG_GROUPS: list[dict[str, str | list[str]]] = [
    {"name": "Auth", "tags": ["auth", "users"]},
    {"name": "Reference Data", "tags": ["categories", "taxonomies", "materials", "product-types"]},
    {"name": "Data Collection", "tags": ["products"]},
    {"name": "Plugins", "tags": ["rpi-cam-management", "rpi-cam-interaction"]},
]
FULL_TAG_GROUPS = [*PUBLIC_TAG_GROUPS, ADMIN_TAG_GROUP]


### OpenAPI schema generation ###
def _build_canonical_openapi(app: FastAPI) -> dict[str, Any]:
    """Generate the complete canonical OpenAPI schema."""
    schema: dict[str, Any] = get_openapi(
        title=API_TITLE,
        version=API_CONTRACT_VERSION,
        description=API_DESCRIPTION,
        routes=app.routes,
        license_info=LICENSE_INFO,
    )
    _add_schema_metadata(schema, tag_groups=FULL_TAG_GROUPS)
    return schema


def _build_filtered_openapi(
    app: FastAPI,
    *,
    include_route: Callable[[APIRoute], bool],
    tag_groups: list[dict[str, str | list[str]]],
) -> dict[str, Any]:
    """Generate an OpenAPI schema with routes filtered before schema generation."""
    schema: dict[str, Any] = get_openapi(
        title=API_TITLE,
        version=API_CONTRACT_VERSION,
        description=API_DESCRIPTION,
        routes=_filter_openapi_routes(app.routes, include_route=include_route),
        license_info=LICENSE_INFO,
    )
    _add_schema_metadata(schema, tag_groups=tag_groups)
    return schema


def build_public_openapi(app: FastAPI) -> dict[str, Any]:
    """Generate the app/public OpenAPI schema."""
    return _build_filtered_openapi(
        app,
        include_route=_is_public_route,
        tag_groups=PUBLIC_TAG_GROUPS,
    )


def _build_admin_openapi(app: FastAPI) -> dict[str, Any]:
    """Generate the admin OpenAPI schema."""
    return _build_filtered_openapi(
        app,
        include_route=_is_admin_route,
        tag_groups=[ADMIN_TAG_GROUP],
    )


def build_device_openapi(app: FastAPI) -> dict[str, Any]:
    """Generate the device/plugin OpenAPI schema."""
    return _build_filtered_openapi(
        app,
        include_route=_is_device_route,
        tag_groups=[{"name": "Device", "tags": ["rpi-cam-interaction", "RPi Camera Pairing"]}],
    )


def _add_schema_metadata(schema: dict[str, Any], *, tag_groups: list[dict[str, str | list[str]]]) -> None:
    """Attach common API metadata to an OpenAPI schema."""
    schema["x-tagGroups"] = tag_groups
    schema["info"]["version"] = API_CONTRACT_VERSION
    schema["info"]["x-api-version"] = API_CONTRACT_VERSION
    schema["info"]["x-api-major"] = API_MAJOR
    schema["info"]["x-deprecation-policy"] = "Breaking changes are documented in release notes."


def _filter_openapi_routes(
    routes: Sequence[BaseRoute],
    *,
    include_route: Callable[[APIRoute], bool],
) -> list[RouteContext]:
    """Return route contexts for FastAPI's OpenAPI generator, filtering only API routes.

    FastAPI nests included routers under ``_IncludedRouter`` wrappers, so ``app.routes``
    no longer exposes flat ``APIRoute`` objects. ``iter_route_contexts`` flattens the
    tree into contexts that carry each route's effective (prefixed) path; ``get_openapi``
    accepts those contexts back directly.
    """
    contexts = list(iter_route_contexts(routes))
    return [ctx for ctx in contexts if not isinstance(ctx.route, APIRoute) or include_route(ctx.route)]


def _is_public_route(route: APIRoute) -> bool:
    audiences = set(route_audiences(route))
    return RouteAudience.PUBLIC.value in audiences or RouteAudience.APP.value in audiences


def _is_admin_route(route: APIRoute) -> bool:
    # Explicit opt-in via AdminAPIRouter only; no tag or path fallback.
    return RouteAudience.ADMIN.value in set(route_audiences(route))


def _is_device_route(route: APIRoute) -> bool:
    # Explicit opt-in via DeviceAPIRouter only; no path fallback.
    return RouteAudience.DEVICE.value in set(route_audiences(route))


def _register_internal_docs(router: APIRouter, app: FastAPI) -> None:
    """Register development/testing-only canonical and admin schemas."""

    @router.get("/openapi.json")
    async def get_openapi_schema(request: Request) -> Response:
        return conditional_json_response(request, app.openapi())

    @router.get("/openapi.admin.json")
    async def get_admin_openapi(request: Request) -> Response:
        return conditional_json_response(request, _build_admin_openapi(app))


def _register_public_docs(router: APIRouter, app: FastAPI) -> None:
    """Register public app and device/plugin integration schemas."""

    @router.get("/openapi.public.json")
    async def get_public_openapi(request: Request) -> Response:
        return conditional_json_response(request, build_public_openapi(app))

    @router.get("/openapi.device.json")
    async def get_device_openapi(request: Request) -> Response:
        return conditional_json_response(request, build_device_openapi(app))


def init_openapi_docs(app: FastAPI, *, include_internal_contracts: bool) -> FastAPI:
    """Initialize OpenAPI documentation endpoints.

    Overrides app.openapi() so the complete schema is the canonical schema
    for the app (the standard FastAPI integration point for tooling and middleware).
    The /openapi.json endpoint simply delegates to app.openapi().
    """

    def _canonical_openapi(_: FastAPI) -> dict[str, Any]:
        return _build_canonical_openapi(app)

    openapi_app = cast("Any", app)
    openapi_app.openapi = MethodType(_canonical_openapi, app)

    public_docs_router = APIRouter(prefix="", include_in_schema=False)
    _register_public_docs(public_docs_router, app)
    if include_internal_contracts:
        _register_internal_docs(public_docs_router, app)

    app.include_router(public_docs_router)

    return app
