"""HTTP Client fixtures for API testing."""

from __future__ import annotations

from contextlib import contextmanager
from typing import TYPE_CHECKING
from unittest.mock import patch

import httpx
import pytest
from fastapi import FastAPI
from httpx import ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.dependencies import (
    current_active_superuser,
    current_active_user,
    current_active_verified_user,
    optional_current_active_user,
)
from app.api.auth.models import User
from app.api.auth.services.rate_limiter import limiter
from app.api.auth.services.user_database import get_auth_async_session
from app.core.cache import close_fastapi_cache, init_fastapi_cache
from app.core.config import settings
from app.core.database import get_async_session
from app.main import create_app


class _NoNetworkTransport(httpx.AsyncBaseTransport):
    """Async transport that returns empty 200 responses without touching the network.

    Used so tests that trigger outbound HTTP calls (e.g. Have I Been Pwnd password-breach checks)
    never make real network requests.  An empty 200 body is safe for every caller:
    - Have I Been Pwnd interprets an empty body as "no suffixes matched → 0 breaches".
    - Any other callers that fail open on non-OK responses are also fine.
    """

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        _ = request
        return httpx.Response(200, content=b"")


if TYPE_CHECKING:
    from collections.abc import AsyncGenerator, Generator, Iterator
    from pathlib import Path

    from redis.asyncio import Redis

    from app.api.auth.models import User


def _configure_test_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Point storage settings at per-test temp dirs."""
    uploads_path = tmp_path / "uploads"
    file_storage_path = uploads_path / "files"
    image_storage_path = uploads_path / "images"

    monkeypatch.setattr(settings, "uploads_path", uploads_path)
    monkeypatch.setattr(settings, "file_storage_path", file_storage_path)
    monkeypatch.setattr(settings, "image_storage_path", image_storage_path)


@contextmanager
def override_authenticated_user(
    test_app: FastAPI,
    user: User,
    *,
    verified: bool = True,
    optional: bool = True,
    superuser: bool = False,
) -> Iterator[None]:
    """Temporarily bind auth dependencies to a specific test user."""
    test_app.dependency_overrides[current_active_user] = lambda: user
    if verified:
        test_app.dependency_overrides[current_active_verified_user] = lambda: user
    if optional:
        test_app.dependency_overrides[optional_current_active_user] = lambda: user
    if superuser:
        test_app.dependency_overrides[current_active_superuser] = lambda: user

    try:
        yield
    finally:
        test_app.dependency_overrides.pop(current_active_user, None)
        test_app.dependency_overrides.pop(current_active_verified_user, None)
        test_app.dependency_overrides.pop(optional_current_active_user, None)
        test_app.dependency_overrides.pop(current_active_superuser, None)


@pytest.fixture
def test_app() -> Generator[FastAPI]:
    """Provide fresh FastAPI app instance.

    Yields app with cleared dependency overrides after each test.
    """
    app = create_app()
    yield app
    app.dependency_overrides.clear()


@pytest.fixture
async def api_client(
    test_app: FastAPI,
    db_session: AsyncSession,
    mock_redis_dependency: Redis,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncGenerator[httpx.AsyncClient]:
    """Provide async HTTP client for API testing.

    Uses httpx.AsyncClient for true async testing of ASGI application.
    Automatically injects test database session.
    Disables rate limiting for tests.
    Sets up Redis for on_after_login hooks.
    """
    _configure_test_storage(tmp_path, monkeypatch)

    async def override_get_session() -> AsyncGenerator[AsyncSession]:
        yield db_session

    # Override both the app-wide DB session seam and the auth-specific seam that wraps it lazily.
    test_app.dependency_overrides[get_async_session] = override_get_session
    test_app.dependency_overrides[get_auth_async_session] = override_get_session

    limiter.enabled = False
    outbound_http_client = httpx.AsyncClient(transport=_NoNetworkTransport())

    with (
        patch("app.core.lifecycle.init_redis", return_value=mock_redis_dependency),
        patch("app.core.lifecycle.init_blocking_redis", return_value=None),
        patch("app.core.lifecycle.create_http_client", return_value=outbound_http_client),
    ):
        async with test_app.router.lifespan_context(test_app):
            init_fastapi_cache(mock_redis_dependency)

            async with httpx.AsyncClient(
                transport=ASGITransport(app=test_app),
                base_url="http://test",
                follow_redirects=True,
            ) as client:
                yield client

            # Cleanup
            await close_fastapi_cache()
            limiter.enabled = True
            test_app.dependency_overrides.clear()


@pytest.fixture
async def api_client_light(
    test_app: FastAPI,
    db_session: AsyncSession,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncGenerator[httpx.AsyncClient]:
    """Provide a lightweight async client without full app lifespan startup.

    Use this for read-focused API tests that only need the injected DB session
    and in-memory cache initialization.

    Safe fits:
    - Plain DB-backed reads and pagination/filtering assertions
    - Tests that authenticate by dependency override rather than real auth backends

    Keep using the full ``api_client`` for routes that depend on runtime startup
    services or auth/session wiring, including:
    - Optional/guest auth resolution that still passes through auth backends
    - Cookie/session/refresh/OAuth flows
    - Newsletter, file-storage, and other runtime-service-heavy paths
    """
    _configure_test_storage(tmp_path, monkeypatch)

    async def override_get_session() -> AsyncGenerator[AsyncSession]:
        yield db_session

    test_app.dependency_overrides[get_async_session] = override_get_session
    test_app.dependency_overrides[get_auth_async_session] = override_get_session

    limiter.enabled = False
    init_fastapi_cache(None)

    try:
        async with httpx.AsyncClient(
            transport=ASGITransport(app=test_app),
            base_url="http://test",
            follow_redirects=True,
        ) as client:
            yield client
    finally:
        await close_fastapi_cache()
        limiter.enabled = True
        test_app.dependency_overrides.clear()


@pytest.fixture
async def api_client_user(
    api_client: httpx.AsyncClient, db_user: User, test_app: FastAPI
) -> AsyncGenerator[httpx.AsyncClient]:
    """Provide an authenticated client for a regular active user."""
    with override_authenticated_user(test_app, db_user):
        yield api_client


@pytest.fixture
async def api_client_superuser_light(
    api_client_light: httpx.AsyncClient, db_superuser: User, test_app: FastAPI
) -> AsyncGenerator[httpx.AsyncClient]:
    """Provide a lightweight authenticated client with superuser privileges."""
    with override_authenticated_user(test_app, db_superuser, superuser=True):
        yield api_client_light


@pytest.fixture
async def api_client_superuser(
    api_client: httpx.AsyncClient, db_superuser: User, test_app: FastAPI
) -> AsyncGenerator[httpx.AsyncClient]:
    """Provide an authenticated client with superuser privileges (via dependency override)."""
    with override_authenticated_user(test_app, db_superuser, superuser=True):
        yield api_client
