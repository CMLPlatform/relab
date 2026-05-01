"""Tests for backend HTTP security headers."""

from __future__ import annotations

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.core.middleware.security_headers import (
    CONTENT_SECURITY_POLICY_HEADER_VALUE,
    HSTS_HEADER_VALUE,
    REFERRER_POLICY_HEADER_VALUE,
    register_security_headers_middleware,
)


async def test_security_headers_middleware_sets_browser_baseline_headers() -> None:
    """Backend responses should include the lean browser hardening baseline."""
    app = FastAPI()

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    register_security_headers_middleware(app, enable_hsts=False)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://api.example.test") as client:
        response = await client.get("/health")

    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == REFERRER_POLICY_HEADER_VALUE
    assert response.headers["content-security-policy"] == CONTENT_SECURITY_POLICY_HEADER_VALUE


async def test_security_headers_middleware_sets_hsts_when_enabled() -> None:
    """Enabled HSTS middleware should add the deployment policy header."""
    app = FastAPI()

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    register_security_headers_middleware(app, enable_hsts=True)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://api.example.test") as client:
        response = await client.get("/health")

    assert response.headers["strict-transport-security"] == HSTS_HEADER_VALUE


async def test_security_headers_middleware_wraps_framework_middleware_responses() -> None:
    """HSTS should also apply to responses produced before route handling."""
    app = FastAPI()
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["api.example.test"])
    register_security_headers_middleware(app, enable_hsts=True)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://evil.example.test") as client:
        response = await client.get("/health")

    assert response.status_code == 400
    assert response.headers["strict-transport-security"] == HSTS_HEADER_VALUE


async def test_security_headers_middleware_skips_hsts_when_disabled() -> None:
    """Disabled HSTS middleware should leave local/test responses unchanged."""
    app = FastAPI()

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    register_security_headers_middleware(app, enable_hsts=False)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://api.example.test") as client:
        response = await client.get("/health")

    assert "strict-transport-security" not in response.headers
