"""Utilities for generating canonical and audience-filtered OpenAPI documentation."""

from types import MethodType
from typing import TYPE_CHECKING, Any, cast

from fastapi import APIRouter, FastAPI
from fastapi.openapi.utils import get_openapi
from fastapi.requests import Request
from fastapi.responses import Response
from fastapi.routing import APIRoute

from app.__version__ import version as service_version
from app.api.audiences import OPENAPI_AUDIENCE_EXTENSION, PublicAPIRouter, RouteAudience, merge_audience_extra
from app.api.common.config import settings as api_settings
from app.core.responses import conditional_json_response

if TYPE_CHECKING:
    from collections.abc import Callable

__all__ = [
    "PublicAPIRouter",
    "build_device_openapi",
    "build_public_openapi",
    "init_openapi_docs",
    "mark_router_routes_public",
]

### Constants ###
OPENAPI_PUBLIC_INCLUSION_EXTENSION: str = "x-public"
API_CONTRACT_VERSION = "1.0.0"
API_MAJOR = "v1"
ADMIN_TAG = "admin"
DEVICE_ROUTE_SUFFIXES = ("/image-upload", "/preview-thumbnail-upload", "/self")


### Route inclusion functions ###
def mark_router_routes_public(router: APIRouter) -> None:
    """Mark all routes in a router as public."""
    for route in router.routes:
        if isinstance(route, APIRoute):
            existing_extra = route.openapi_extra or {}
            route.openapi_extra = {
                **merge_audience_extra(existing_extra, RouteAudience.PUBLIC, RouteAudience.APP),
                OPENAPI_PUBLIC_INCLUSION_EXTENSION: True,
            }


### OpenAPI schema generation ###
def _build_canonical_openapi(app: FastAPI) -> dict[str, Any]:
    """Generate the complete canonical OpenAPI schema."""
    schema: dict[str, Any] = get_openapi(
        title=api_settings.full_docs.title,
        version=API_CONTRACT_VERSION,
        description=api_settings.full_docs.description,
        routes=app.routes,
        license_info=api_settings.full_docs.license_info,
    )
    _add_schema_metadata(schema, tag_groups=api_settings.full_docs.x_tag_groups)
    return schema


def _build_filtered_openapi(
    app: FastAPI,
    *,
    include_operation: Callable[[str, dict[str, Any]], bool],
    tag_groups: list[dict[str, str | list[str]]],
) -> dict[str, Any]:
    """Generate an OpenAPI schema with paths filtered by operation metadata."""
    schema: dict[str, Any] = get_openapi(
        title=api_settings.public_docs.title,
        version=API_CONTRACT_VERSION,
        description=api_settings.public_docs.description,
        routes=app.routes,
        license_info=api_settings.public_docs.license_info,
    )

    filtered_paths: dict[str, Any] = {}
    for path, path_item in schema["paths"].items():
        for method, operation in path_item.items():
            if include_operation(path, operation):
                filtered_paths.setdefault(path, {})[method] = operation
    schema["paths"] = filtered_paths
    _add_schema_metadata(schema, tag_groups=tag_groups)
    return schema


def build_public_openapi(app: FastAPI) -> dict[str, Any]:
    """Generate the app/public OpenAPI schema."""
    return _build_filtered_openapi(
        app,
        include_operation=_is_public_operation,
        tag_groups=api_settings.public_docs.x_tag_groups,
    )


def _build_admin_openapi(app: FastAPI) -> dict[str, Any]:
    """Generate the admin OpenAPI schema."""
    return _build_filtered_openapi(
        app,
        include_operation=_is_admin_operation,
        tag_groups=[{"name": "Admin", "tags": ["admin"]}],
    )


def build_device_openapi(app: FastAPI) -> dict[str, Any]:
    """Generate the device/plugin OpenAPI schema."""
    return _build_filtered_openapi(
        app,
        include_operation=_is_device_operation,
        tag_groups=[{"name": "Device", "tags": ["rpi-cam-interaction", "RPi Camera Pairing"]}],
    )


def _add_schema_metadata(schema: dict[str, Any], *, tag_groups: list[dict[str, str | list[str]]]) -> None:
    """Attach common API metadata to an OpenAPI schema."""
    schema["x-tagGroups"] = tag_groups
    schema["info"]["version"] = API_CONTRACT_VERSION
    schema["info"]["x-api-version"] = API_CONTRACT_VERSION
    schema["info"]["x-api-major"] = API_MAJOR
    schema["info"]["x-service-version"] = service_version
    schema["info"]["x-deprecation-policy"] = "Breaking changes are documented in release notes."


def _operation_audiences(operation: dict[str, Any]) -> set[str]:
    audiences = operation.get(OPENAPI_AUDIENCE_EXTENSION, [])
    if isinstance(audiences, str):
        return {audiences}
    if isinstance(audiences, list):
        return {audience for audience in audiences if isinstance(audience, str)}
    return set()


def _operation_tags(operation: dict[str, Any]) -> set[str]:
    tags = operation.get("tags", [])
    if isinstance(tags, list):
        return {tag for tag in tags if isinstance(tag, str)}
    return set()


def _is_public_operation(_: str, operation: dict[str, Any]) -> bool:
    audiences = _operation_audiences(operation)
    return (
        operation.get(OPENAPI_PUBLIC_INCLUSION_EXTENSION, False)
        or RouteAudience.PUBLIC.value in audiences
        or RouteAudience.APP.value in audiences
    )


def _is_admin_operation(path: str, operation: dict[str, Any]) -> bool:
    audiences = _operation_audiences(operation)
    tags = _operation_tags(operation)
    return RouteAudience.ADMIN.value in audiences or ADMIN_TAG in tags or path.startswith(f"/{API_MAJOR}/admin/")


def _is_device_operation(path: str, operation: dict[str, Any]) -> bool:
    audiences = _operation_audiences(operation)
    if RouteAudience.DEVICE.value in audiences:
        return True
    return path.startswith(f"/{API_MAJOR}/plugins/rpi-cam/pairing/") or path.endswith(DEVICE_ROUTE_SUFFIXES)


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
