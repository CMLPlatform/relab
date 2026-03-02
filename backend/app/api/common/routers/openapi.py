"""Utilities for including or excluding endpoints in the public OpenAPI schema and documentation."""

from typing import TYPE_CHECKING

from fastapi import APIRouter, FastAPI, Security
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.responses import HTMLResponse
from fastapi.routing import APIRoute
from fastapi.types import DecoratedCallable
from fastapi_cache.decorator import cache

from app.api.auth.dependencies import current_active_superuser
from app.api.common.config import settings as api_settings
from app.api.common.routers.file_mounts import FAVICON_ROUTE
from app.core.cache import HTMLCoder
from app.core.config import CacheNamespace, settings

if TYPE_CHECKING:
    from collections.abc import Callable
    from typing import Any

### Constants ###
OPENAPI_PUBLIC_INCLUSION_EXTENSION: str = "x-public"


### Route inclusion functions ###
class PublicAPIRouter(APIRouter):
    """A router that marks all routes as public in the OpenAPI schema.

    Example: public_router = PublicAPIRouter(prefix="/products", tags=["products"])
    """

    def api_route(self, path: str, *args: Any, **kwargs: Any) -> Callable[[DecoratedCallable], DecoratedCallable]:  # noqa: ANN401 # Any-typed (kw)args are expected by the parent method signatures
        """Override the default api_route method to add the public inclusion extension to the OpenAPI schema."""
        existing_extra = kwargs.get("openapi_extra") or {}
        kwargs["openapi_extra"] = {**existing_extra, OPENAPI_PUBLIC_INCLUSION_EXTENSION: True}
        return super().api_route(path, *args, **kwargs)


def public_endpoint(router_method: Callable) -> Callable:
    """Wrapper function to mark an endpoint method as public."""

    def wrapper(*args: Any, **kwargs: Any) -> Callable[[DecoratedCallable], DecoratedCallable]:  # noqa: ANN401 # Any-typed (kw)args are expected by the parent method signatures
        existing_extra = kwargs.get("openapi_extra") or {}
        kwargs["openapi_extra"] = {**existing_extra, OPENAPI_PUBLIC_INCLUSION_EXTENSION: True}
        return router_method(*args, **kwargs)

    return wrapper


def mark_router_routes_public(router: APIRouter) -> None:
    """Mark all routes in a router as public."""
    for route in router.routes:
        if isinstance(route, APIRoute):
            existing_extra = route.openapi_extra or {}
            route.openapi_extra = {**existing_extra, OPENAPI_PUBLIC_INCLUSION_EXTENSION: True}


### OpenAPI schema generation ###
def get_filtered_openapi_schema(app: FastAPI) -> dict[str, Any]:
    """Generate OpenAPI schema with only public endpoints."""
    openapi_schema: dict[str, Any] = get_openapi(
        title=api_settings.public_docs.title,
        version=api_settings.public_docs.version,
        description=api_settings.public_docs.description,
        routes=app.routes,
        license_info=api_settings.public_docs.license_info,
    )

    paths = openapi_schema["paths"]
    filtered_paths = {}

    # Only include paths marked as public
    for path, path_item in paths.items():
        for method, operation in path_item.items():
            if operation.get(OPENAPI_PUBLIC_INCLUSION_EXTENSION, False):
                if path not in filtered_paths:
                    filtered_paths[path] = {}
                filtered_paths[path][method] = operation

    openapi_schema["paths"] = filtered_paths

    # Add tag groups for better organization in Redoc
    openapi_schema["x-tagGroups"] = api_settings.public_docs.x_tag_groups

    return openapi_schema


def init_openapi_docs(app: FastAPI) -> FastAPI:
    """Initialize OpenAPI documentation endpoints."""
    public_docs_router = APIRouter(prefix="", include_in_schema=False)

    # Public documentation
    @public_docs_router.get("/openapi.json")
    @cache(expire=settings.cache.ttls[CacheNamespace.DOCS])
    async def get_openapi_schema() -> dict:
        return get_filtered_openapi_schema(app)

    @public_docs_router.get("/docs")
    @cache(expire=settings.cache.ttls[CacheNamespace.DOCS], coder=HTMLCoder)
    async def get_swagger_docs() -> HTMLResponse:
        return get_swagger_ui_html(
            openapi_url="/openapi.json",
            title="Public API Documentation",
            swagger_favicon_url=FAVICON_ROUTE,
        )

    @public_docs_router.get("/redoc")
    @cache(expire=settings.cache.ttls[CacheNamespace.DOCS], coder=HTMLCoder)
    async def get_redoc_docs() -> HTMLResponse:
        return get_redoc_html(
            openapi_url="/openapi.json", title="Public API Documentation - ReDoc", redoc_favicon_url=FAVICON_ROUTE
        )

    app.include_router(public_docs_router)

    # Full documentation (requires superuser)
    full_docs_router = APIRouter(prefix="", dependencies=[Security(current_active_superuser)], include_in_schema=False)

    @full_docs_router.get("/openapi_full.json")
    @cache(expire=settings.cache.ttls[CacheNamespace.DOCS])
    async def get_full_openapi() -> dict:
        return get_openapi(
            title=api_settings.full_docs.title,
            version=api_settings.full_docs.version,
            description=api_settings.full_docs.description,
            routes=app.routes,
            license_info=api_settings.full_docs.license_info,
        )

    @full_docs_router.get("/docs/full")
    @cache(expire=settings.cache.ttls[CacheNamespace.DOCS], coder=HTMLCoder)
    async def get_full_swagger_docs() -> HTMLResponse:
        return get_swagger_ui_html(
            openapi_url="/openapi_full.json", title="Full API Documentation", swagger_favicon_url=FAVICON_ROUTE
        )

    @full_docs_router.get("/redoc/full")
    @cache(expire=settings.cache.ttls[CacheNamespace.DOCS], coder=HTMLCoder)
    async def get_full_redoc_docs() -> HTMLResponse:
        return get_redoc_html(
            openapi_url="/openapi_full.json", title="Full API Documentation", redoc_favicon_url=FAVICON_ROUTE
        )

    app.include_router(full_docs_router)

    return app
