"""Unit tests for backend response policy middleware."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.common.routers.exceptions import register_exception_handlers
from app.core.middleware.response_policy import (
    CONTENT_SECURITY_POLICY_HEADER_VALUE,
    HSTS_HEADER_VALUE,
    NO_STORE,
    REFERRER_POLICY_HEADER_VALUE,
    register_response_policy_middleware,
)


def _create_policy_app(*, enable_hsts: bool = False) -> FastAPI:
    app = FastAPI()
    register_response_policy_middleware(app, enable_hsts=enable_hsts)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/v1/products")
    async def public_products() -> dict[str, str]:
        return {"status": "public"}

    @app.get("/v1/auth/session")
    async def auth_session() -> dict[str, str]:
        return {"status": "sensitive"}

    @app.get("/v1/authors")
    async def authors() -> dict[str, str]:
        return {"status": "public"}

    @app.get("/v1/admin/users")
    async def admin_users() -> dict[str, str]:
        return {"status": "admin"}

    @app.get("/v1/plugins/rpi-cam/cameras/1/status")
    async def camera_control() -> dict[str, str]:
        return {"status": "camera"}

    @app.get("/v1/error")
    async def error_probe() -> None:
        raise HTTPException(status_code=404, detail="Missing")

    register_exception_handlers(app)
    return app


async def test_response_policy_sets_browser_baseline_headers() -> None:
    """Backend responses should include the lean browser hardening baseline."""
    app = _create_policy_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://api.example.test") as client:
        response = await client.get("/health")

    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == REFERRER_POLICY_HEADER_VALUE
    assert response.headers["content-security-policy"] == CONTENT_SECURITY_POLICY_HEADER_VALUE


async def test_response_policy_sets_self_hosted_csp() -> None:
    """Backend CSP should allow only same-origin browser assets and API calls."""
    app = _create_policy_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://api.example.test") as client:
        response = await client.get("/health")

    policy = response.headers["content-security-policy"]
    for directive in (
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    ):
        assert directive in policy
    assert "'unsafe-inline'" not in policy
    assert "'unsafe-eval'" not in policy
    assert "script-src *" not in policy
    assert "style-src *" not in policy
    assert "javascript:" not in policy


async def test_response_policy_sets_hsts_when_enabled() -> None:
    """Enabled HSTS policy should add the deployment header."""
    app = _create_policy_app(enable_hsts=True)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://api.example.test") as client:
        response = await client.get("/health")

    assert response.headers["strict-transport-security"] == HSTS_HEADER_VALUE


async def test_response_policy_wraps_framework_middleware_responses() -> None:
    """HSTS should also apply to responses produced before route handling."""
    app = FastAPI()
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["api.example.test"])
    register_response_policy_middleware(app, enable_hsts=True)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://evil.example.test") as client:
        response = await client.get("/health")

    assert response.status_code == 400
    assert response.headers["strict-transport-security"] == HSTS_HEADER_VALUE


async def test_response_policy_skips_hsts_when_disabled() -> None:
    """Disabled HSTS policy should leave local/test responses unchanged."""
    app = _create_policy_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://api.example.test") as client:
        response = await client.get("/health")

    assert "strict-transport-security" not in response.headers


async def test_response_policy_keeps_public_reads_cacheable() -> None:
    """Public reads without credentials should not receive no-store by default."""
    app = _create_policy_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/v1/products")

    assert "cache-control" not in response.headers


async def test_response_policy_sets_no_store_for_sensitive_paths() -> None:
    """Sensitive auth, admin, and camera-control paths should receive no-store."""
    app = _create_policy_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        auth_response = await client.get("/v1/auth/session")
        admin_response = await client.get("/v1/admin/users")
        camera_response = await client.get("/v1/plugins/rpi-cam/cameras/1/status")

    assert auth_response.headers["cache-control"] == NO_STORE
    assert admin_response.headers["cache-control"] == NO_STORE
    assert camera_response.headers["cache-control"] == NO_STORE


async def test_response_policy_uses_path_boundaries() -> None:
    """A public path with a sensitive-prefix lookalike should stay cacheable."""
    app = _create_policy_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/v1/authors")

    assert "cache-control" not in response.headers


async def test_response_policy_sets_no_store_for_authenticated_requests() -> None:
    """Requests with Authorization or RELab auth cookies should receive no-store."""
    app = _create_policy_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        bearer_response = await client.get("/v1/products", headers={"authorization": "Bearer token"})
        client.cookies.set("auth", "token")
        cookie_response = await client.get("/v1/products")

    assert bearer_response.headers["cache-control"] == NO_STORE
    assert cookie_response.headers["cache-control"] == NO_STORE


async def test_response_policy_sets_no_store_for_problem_details() -> None:
    """Problem Details responses should receive no-store."""
    app = _create_policy_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/v1/error")

    assert response.status_code == 404
    assert response.headers["cache-control"] == NO_STORE
