"""Utilities for including or excluding endpoints in the public OpenAPI schema and documentation."""

from types import MethodType
from typing import TYPE_CHECKING, Any, cast

from fastapi import APIRouter, FastAPI, Security
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.requests import Request
from fastapi.responses import HTMLResponse, Response
from fastapi.routing import APIRoute
from fastapi.types import DecoratedCallable

from app.api.auth.dependencies import current_active_superuser
from app.api.common.config import settings as api_settings
from app.api.common.routers.file_mounts import FAVICON_ROUTE
from app.core.config import Environment, settings
from app.core.responses import conditional_html_response, conditional_json_response

if TYPE_CHECKING:
    from collections.abc import Callable

### Constants ###
OPENAPI_PUBLIC_INCLUSION_EXTENSION: str = "x-public"


### Route inclusion functions ###
def _html_body_text(response: HTMLResponse) -> str:
    """Normalize Starlette HTML response bodies to plain text."""
    return bytes(response.body).decode("utf-8")


class PublicAPIRouter(APIRouter):
    """A router that marks all routes as public in the OpenAPI schema.

    Example: public_router = PublicAPIRouter(prefix="/products", tags=["products"])
    """

    def api_route(self, path: str, *args: Any, **kwargs: Any) -> Callable[[DecoratedCallable], DecoratedCallable]:  # noqa: ANN401 # Any-typed (kw)args are expected by the parent method signatures
        """Override the default api_route method to add the public inclusion extension to the OpenAPI schema."""
        existing_extra = kwargs.get("openapi_extra") or {}
        kwargs["openapi_extra"] = {**existing_extra, OPENAPI_PUBLIC_INCLUSION_EXTENSION: True}
        return super().api_route(path, *args, **kwargs)


def mark_router_routes_public(router: APIRouter) -> None:
    """Mark all routes in a router as public."""
    for route in router.routes:
        if isinstance(route, APIRoute):
            existing_extra = route.openapi_extra or {}
            route.openapi_extra = {**existing_extra, OPENAPI_PUBLIC_INCLUSION_EXTENSION: True}


### OpenAPI schema generation ###
def _build_public_openapi(app: FastAPI) -> dict[str, Any]:
    """Generate the public OpenAPI schema, keeping only routes marked with x-public."""
    schema: dict[str, Any] = get_openapi(
        title=api_settings.public_docs.title,
        version=api_settings.public_docs.version,
        description=api_settings.public_docs.description,
        routes=app.routes,
        license_info=api_settings.public_docs.license_info,
    )

    filtered_paths: dict[str, Any] = {}
    for path, path_item in schema["paths"].items():
        for method, operation in path_item.items():
            if operation.get(OPENAPI_PUBLIC_INCLUSION_EXTENSION, False):
                filtered_paths.setdefault(path, {})[method] = operation
    schema["paths"] = filtered_paths
    schema["x-tagGroups"] = api_settings.public_docs.x_tag_groups
    schema["info"]["x-api-version"] = api_settings.public_docs.version
    schema["info"]["x-deprecation-policy"] = "Breaking changes are documented in release notes."
    return schema


def init_openapi_docs(app: FastAPI) -> FastAPI:
    """Initialize OpenAPI documentation endpoints.

    Overrides app.openapi() so the public filtered schema is the canonical schema
    for the app (the standard FastAPI integration point for tooling and middleware).
    The /openapi.json endpoint simply delegates to app.openapi().
    """
    def _public_openapi(_: FastAPI) -> dict[str, Any]:
        return _build_public_openapi(app)

    openapi_app = cast("Any", app)
    openapi_app.openapi = MethodType(_public_openapi, app)

    public_docs_router = APIRouter(prefix="", include_in_schema=False)

    # Public documentation
    @public_docs_router.get("/openapi.json")
    async def get_openapi_schema(request: Request) -> Response:
        return conditional_json_response(request, app.openapi())

    @public_docs_router.get("/docs")
    async def get_swagger_docs(request: Request) -> Response:
        html = get_swagger_ui_html(
            openapi_url="/openapi.json",
            title="Public API Documentation",
            swagger_favicon_url=FAVICON_ROUTE,
        )
        return conditional_html_response(request, _html_body_text(html))

    @public_docs_router.get("/redoc")
    async def get_redoc_docs(request: Request) -> Response:
        html = get_redoc_html(
            openapi_url="/openapi.json", title="Public API Documentation - ReDoc", redoc_favicon_url=FAVICON_ROUTE
        )
        return conditional_html_response(request, _html_body_text(html))

    app.include_router(public_docs_router)

    # Full documentation — requires superuser in staging/prod, open in dev/testing
    full_docs_deps = (
        [] if settings.environment in (Environment.DEV, Environment.TESTING) else [Security(current_active_superuser)]
    )
    full_docs_router = APIRouter(prefix="", dependencies=full_docs_deps, include_in_schema=False)

    @full_docs_router.get("/openapi_full.json")
    async def get_full_openapi(request: Request) -> Response:
        payload = get_openapi(
            title=api_settings.full_docs.title,
            version=api_settings.full_docs.version,
            description=api_settings.full_docs.description,
            routes=app.routes,
            license_info=api_settings.full_docs.license_info,
        )
        payload["info"]["x-api-version"] = api_settings.full_docs.version
        payload["info"]["x-deprecation-policy"] = "Breaking changes are documented in release notes."
        return conditional_json_response(request, payload)

    @full_docs_router.get("/docs/full")
    async def get_full_swagger_docs(request: Request) -> Response:
        html = get_swagger_ui_html(
            openapi_url="/openapi_full.json", title="Full API Documentation", swagger_favicon_url=FAVICON_ROUTE
        )
        return conditional_html_response(request, _html_body_text(html))

    @full_docs_router.get("/redoc/full")
    async def get_full_redoc_docs(request: Request) -> Response:
        html = get_redoc_html(
            openapi_url="/openapi_full.json", title="Full API Documentation", redoc_favicon_url=FAVICON_ROUTE
        )
        return conditional_html_response(request, _html_body_text(html))

    app.include_router(full_docs_router)

    return app
