"""Route composition tests for targeted DoS rate limits."""

from __future__ import annotations

from inspect import signature

from fastapi import APIRouter, FastAPI
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app.api.auth.services.rate_limiter import Limiter, RateLimitExceededError, rate_limit_exceeded_handler
from app.api.data_collection.routers import search_router
from app.api.data_collection.routers.component_media_routers import component_media_router
from app.api.data_collection.routers.product_mutation_routers import product_mutation_router
from app.api.plugins.rpi_cam.routers.camera_interaction.images import device_router as rpi_cam_device_image_router
from app.api.reference_data.routers.admin_materials import router as material_router
from app.api.reference_data.routers.admin_product_types import router as product_type_router


def _route(router: APIRouter, path: str, method: str) -> APIRoute:
    return next(
        route
        for route in router.routes
        if isinstance(route, APIRoute) and route.path == path and method in route.methods
    )


def _assert_rate_limited(route: APIRoute, dependency_name: str) -> None:
    dependency_names = {
        getattr(dependency.dependency, "__name__", "")
        for dependency in route.dependencies
        if dependency.dependency is not None
    }
    assert dependency_name in dependency_names
    assert "request" not in signature(route.endpoint).parameters


def test_rate_limit_dependency_returns_429() -> None:
    """The FastAPI dependency helper should enforce limits without endpoint wrappers."""
    app = FastAPI()
    limiter = Limiter(key_func=lambda _: "dependency-key", storage_uri="memory://")
    app.add_exception_handler(RateLimitExceededError, rate_limit_exceeded_handler)

    @app.get("/limited", dependencies=[limiter.dependency("1/minute")])
    async def limited_endpoint() -> dict[str, bool]:
        return {"ok": True}

    client = TestClient(app)
    assert client.get("/limited").status_code == 200
    assert client.get("/limited").status_code == 429


def test_expensive_public_product_search_routes_are_rate_limited() -> None:
    """Public derived product search/facet routes should have per-IP read limits."""
    _assert_rate_limited(_route(search_router, "/products/suggestions/brands", "GET"), "api_read_rate_limit")
    _assert_rate_limited(_route(search_router, "/products/suggestions/models", "GET"), "api_read_rate_limit")
    _assert_rate_limited(_route(search_router, "/products/facets", "GET"), "api_read_rate_limit")


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
