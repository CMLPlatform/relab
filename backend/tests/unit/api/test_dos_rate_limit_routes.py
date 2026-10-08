"""Route composition tests for targeted DoS rate limits."""

from inspect import signature

import httpx
import pytest
from fastapi import APIRouter, FastAPI
from fastapi.dependencies.models import Dependant
from fastapi.routing import APIRoute, iter_route_contexts
from httpx import ASGITransport

from app.api.application.routers.account_erasure import self_service_router as account_self_service_router
from app.api.common.rate_limiting import Limiter, RateLimitExceededError, rate_limit_exceeded_handler
from app.api.data_collection.routers.component_core_routers import component_core_router
from app.api.data_collection.routers.component_media_routers import component_media_router
from app.api.data_collection.routers.product_mutation_routers import product_mutation_router
from app.api.data_collection.routers.product_read_routers import product_read_router
from app.api.plugins.rpi_cam.routers.camera_interaction.images import device_router as rpi_cam_device_image_router
from app.api.reference_data.routers.admin_materials import router as material_router
from app.api.reference_data.routers.admin_product_types import router as product_type_router
from app.main import create_app


def _route(router: APIRouter, path: str, method: str) -> APIRoute:
    return next(
        route
        for route in router.routes
        if isinstance(route, APIRoute) and route.path == path and method in (route.methods or set())
    )


def _dependency_names(route: APIRoute) -> set[str]:
    return {
        getattr(dependency.dependency, "__name__", "")
        for dependency in route.dependencies
        if dependency.dependency is not None
    }


def _assert_rate_limited(route: APIRoute, dependency_name: str) -> None:
    assert dependency_name in _dependency_names(route)
    assert "request" not in signature(route.endpoint).parameters


async def test_rate_limit_dependency_returns_429() -> None:
    """The FastAPI dependency helper should enforce limits without endpoint wrappers."""
    app = FastAPI()
    limiter = Limiter(storage_uri="memory://")
    app.add_exception_handler(RateLimitExceededError, rate_limit_exceeded_handler)

    @app.get("/limited", dependencies=[limiter.dependency("1/minute")])
    async def limited_endpoint() -> dict[str, bool]:
        return {"ok": True}

    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="https://test") as client:
        assert (await client.get("/limited")).status_code == 200
        assert (await client.get("/limited")).status_code == 429


def test_expensive_public_product_search_routes_are_rate_limited() -> None:
    """Public derived product search/facet routes should have per-IP read limits."""
    _assert_rate_limited(_route(product_read_router, "/products/suggestions/brands", "GET"), "api_read_rate_limit")
    _assert_rate_limited(_route(product_read_router, "/products/suggestions/models", "GET"), "api_read_rate_limit")
    _assert_rate_limited(_route(product_read_router, "/products/facets", "GET"), "api_read_rate_limit")


def test_product_export_routes_have_the_export_rate_limit() -> None:
    """Exports assemble whole product trees, so they carry a stricter limit than ordinary reads."""
    _assert_rate_limited(_route(product_read_router, "/products/export", "GET"), "api_export_rate_limit")
    _assert_rate_limited(_route(product_read_router, "/products/{product_id}/export", "GET"), "api_export_rate_limit")


def test_product_and_component_upload_routes_are_rate_limited() -> None:
    """User media upload routes should have per-IP upload limits."""
    _assert_rate_limited(
        _route(product_mutation_router, "/products/{product_id}/files", "POST"), "api_upload_rate_limit"
    )
    _assert_rate_limited(
        _route(product_mutation_router, "/products/{product_id}/images", "POST"), "api_upload_rate_limit"
    )
    _assert_rate_limited(
        _route(component_media_router, "/components/{component_id}/files", "POST"), "api_upload_rate_limit"
    )
    _assert_rate_limited(
        _route(component_media_router, "/components/{component_id}/images", "POST"), "api_upload_rate_limit"
    )


@pytest.mark.parametrize(
    ("router", "path", "method"),
    [
        (product_mutation_router, "/products", "POST"),
        (product_mutation_router, "/products/{product_id}", "PATCH"),
        (product_mutation_router, "/products/{product_id}", "DELETE"),
        (product_mutation_router, "/products/{product_id}/components", "POST"),
        (component_core_router, "/components/{component_id}/components", "POST"),
        (component_core_router, "/components/{component_id}", "PATCH"),
        (component_core_router, "/components/{component_id}", "DELETE"),
    ],
)
def test_product_and_component_write_routes_are_rate_limited(router: APIRouter, path: str, method: str) -> None:
    """Authenticated product/component write routes should have per-IP write limits."""
    _assert_rate_limited(_route(router, path, method), "api_write_rate_limit")


def test_reference_data_upload_routes_are_rate_limited() -> None:
    """Admin media upload routes should still have per-IP upload limits."""
    _assert_rate_limited(_route(material_router, "/materials/{material_id}/files", "POST"), "api_upload_rate_limit")
    _assert_rate_limited(_route(material_router, "/materials/{material_id}/images", "POST"), "api_upload_rate_limit")
    _assert_rate_limited(
        _route(product_type_router, "/product-types/{product_type_id}/files", "POST"), "api_upload_rate_limit"
    )
    _assert_rate_limited(
        _route(product_type_router, "/product-types/{product_type_id}/images", "POST"), "api_upload_rate_limit"
    )


def test_rpi_cam_device_upload_routes_are_rate_limited() -> None:
    """Device-pushed upload routes should have the same upload DoS guard."""
    _assert_rate_limited(
        _route(rpi_cam_device_image_router, "/{camera_id}/image-upload", "POST"),
        "api_upload_rate_limit",
    )
    _assert_rate_limited(
        _route(rpi_cam_device_image_router, "/{camera_id}/preview-thumbnail-upload", "POST"),
        "api_upload_rate_limit",
    )


def test_self_service_account_deletion_is_rate_limited() -> None:
    """Deleting your own account takes a password guess, so it carries the per-IP login limit.

    The endpoint keeps its ``request`` parameter to revoke sessions, so only the dependency is checked.
    """
    assert "login_ip_rate_limit" in _dependency_names(_route(account_self_service_router, "/users/me", "DELETE"))


# Mutating /v1 routes that carry no route-level rate limit, each with the reason.
RATE_LIMIT_EXEMPT_ROUTES = {
    # Superuser-only: a stolen admin session is an incident, not a load problem.
    ("POST", "/v1/admin/cache/clear/{namespace}"),
    ("POST", "/v1/admin/categories"),
    ("PATCH", "/v1/admin/categories/{category_id}"),
    ("DELETE", "/v1/admin/categories/{category_id}"),
    ("POST", "/v1/admin/taxonomies"),
    ("PATCH", "/v1/admin/taxonomies/{taxonomy_id}"),
    ("DELETE", "/v1/admin/taxonomies/{taxonomy_id}"),
    ("POST", "/v1/admin/materials"),
    ("PATCH", "/v1/admin/materials/{material_id}"),
    ("DELETE", "/v1/admin/materials/{material_id}"),
    ("POST", "/v1/admin/materials/{material_id}/categories"),
    ("DELETE", "/v1/admin/materials/{material_id}/categories"),
    ("DELETE", "/v1/admin/materials/{material_id}/files/{file_id}"),
    ("DELETE", "/v1/admin/materials/{material_id}/images/{image_id}"),
    ("POST", "/v1/admin/product-types"),
    ("PATCH", "/v1/admin/product-types/{product_type_id}"),
    ("DELETE", "/v1/admin/product-types/{product_type_id}"),
    ("POST", "/v1/admin/product-types/{product_type_id}/categories"),
    ("DELETE", "/v1/admin/product-types/{product_type_id}/categories"),
    ("DELETE", "/v1/admin/product-types/{product_type_id}/files/{file_id}"),
    ("DELETE", "/v1/admin/product-types/{product_type_id}/images/{image_id}"),
    ("PATCH", "/v1/admin/users/{user_id}"),
    ("POST", "/v1/admin/users/{user_id}/mfa/reset"),
    ("PUT", "/v1/admin/users/{user_id}/role"),
    ("DELETE", "/v1/admin/users/{user_id}"),
    ("DELETE", "/v1/admin/plugins/rpi-cam/cameras/{camera_id}"),
    # Device-authenticated: needs a fresh ES256 assertion from a paired camera's key.
    ("DELETE", "/v1/plugins/rpi-cam/device/cameras/{camera_id}/self"),
    # Charged to the per-account guess budget (account_guess_budget) before any work.
    ("POST", "/v1/oauth/github/associate/authorize"),
    ("POST", "/v1/oauth/google/associate/authorize"),
    ("POST", "/v1/oauth/google-youtube/associate/authorize"),
    ("DELETE", "/v1/oauth/{provider}/associate"),
}


def _all_dependency_names(dependant: Dependant) -> set[str]:
    names: set[str] = set()
    for dependency in dependant.dependencies:
        names.add(getattr(dependency.call, "__name__", ""))
        names |= _all_dependency_names(dependency)
    return names


def _mutating_routes() -> list[tuple[str, str, Dependant]]:
    """Return (method, path, effective dependant) for every non-GET /v1 route, router dependencies included."""
    return [
        (method, path, ctx.dependant)
        for ctx in iter_route_contexts(create_app().routes)
        if isinstance(ctx.route, APIRoute) and (path := ctx.path or "").startswith("/v1/")
        for method in sorted(ctx.methods or set())
        if method not in {"GET", "HEAD", "OPTIONS"}
    ]


def test_every_mutating_route_is_rate_limited() -> None:
    """Every non-GET /v1 route carries a rate-limit dependency or a named exemption above."""
    unlimited = {
        (method, path)
        for method, path, dependant in _mutating_routes()
        if not any(name.endswith("rate_limit") for name in _all_dependency_names(dependant))
    }

    assert unlimited - RATE_LIMIT_EXEMPT_ROUTES == set()


def test_rate_limit_exemptions_name_real_routes() -> None:
    """A renamed or removed route must drop out of the exemption set rather than linger there."""
    assert {(method, path) for method, path, _dependant in _mutating_routes()} >= RATE_LIMIT_EXEMPT_ROUTES


def _tree_read_routes() -> list[tuple[str, Dependant]]:
    """Return (path, effective dependant) for every public GET /v1 route that lists components or loads a tree."""
    return [
        (path, ctx.dependant)
        for ctx in iter_route_contexts(create_app().routes)
        if isinstance(ctx.route, APIRoute)
        and (path := ctx.path or "").startswith("/v1/")
        and "GET" in (ctx.methods or set())
        and path.endswith(("/components", "/tree"))
    ]


def test_public_tree_reads_are_rate_limited() -> None:
    """Routes that assemble component lists or trees per request carry the per-IP read limit."""
    routes = _tree_read_routes()
    assert {
        "/v1/products/{product_id}/components",
        "/v1/products/{product_id}/components/tree",
        "/v1/categories/tree",
        "/v1/categories/{category_id}/subcategories/tree",
        "/v1/taxonomies/{taxonomy_id}/categories/tree",
    } <= {path for path, _dependant in routes}
    assert {
        path for path, dependant in routes if "api_read_rate_limit" not in _all_dependency_names(dependant)
    } == set()


def test_rpi_cam_capture_spends_the_upload_budget() -> None:
    """A camera capture stores a full-size photo, so it is charged like an upload."""
    dependant = next(
        dependant
        for method, path, dependant in _mutating_routes()
        if (method, path) == ("POST", "/v1/plugins/rpi-cam/cameras/{camera_id}/captures")
    )
    assert "api_upload_rate_limit" in _all_dependency_names(dependant)
