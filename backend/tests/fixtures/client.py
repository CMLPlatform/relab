"""HTTP Client fixtures for API testing."""

from __future__ import annotations

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
from app.core.cache import close_fastapi_cache, init_fastapi_cache
from app.core.config import settings
from app.core.database import get_async_session
from app.main import create_app
from tests.factories.models import UserFactory


class _NoNetworkTransport(httpx.AsyncBaseTransport):
    """Async transport that returns empty 200 responses without touching the network.

    Used so tests that trigger outbound HTTP calls (e.g. Have I Been Pwnd password-breach checks)
    never make real network requests.  An empty 200 body is safe for every caller:
    - Have I Been Pwnd interprets an empty body as "no suffixes matched → 0 breaches".
    - Any other callers that fail open on non-OK responses are also fine.
    """

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:  # noqa: ARG002
        return httpx.Response(200, content=b"")


if TYPE_CHECKING:
    from collections.abc import AsyncGenerator, Generator
    from pathlib import Path

    from redis.asyncio import Redis


def _configure_test_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Point storage settings at per-test temp dirs."""
    uploads_path = tmp_path / "uploads"
    file_storage_path = uploads_path / "files"
    image_storage_path = uploads_path / "images"

    monkeypatch.setattr(settings, "uploads_path", uploads_path)
    monkeypatch.setattr(settings, "file_storage_path", file_storage_path)
    monkeypatch.setattr(settings, "image_storage_path", image_storage_path)


@pytest.fixture
def test_app() -> Generator[FastAPI]:
    """Provide fresh FastAPI app instance.

    Yields app with cleared dependency overrides after each test.
    """
    app = create_app()
    yield app
    app.dependency_overrides.clear()


@pytest.fixture
async def async_client(
    test_app: FastAPI,
    session: AsyncSession,
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
        yield session

    test_app.dependency_overrides[get_async_session] = override_get_session

    limiter.enabled = False
    outbound_http_client = httpx.AsyncClient(transport=_NoNetworkTransport())

    with (
        patch("app.main.init_redis", return_value=mock_redis_dependency),
        patch("app.main.init_blocking_redis", return_value=None),
        patch("app.main.create_http_client", return_value=outbound_http_client),
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
            test_app.state.redis = None
            await close_fastapi_cache()
            limiter.enabled = True
            test_app.dependency_overrides.clear()


@pytest.fixture
async def superuser(session: AsyncSession) -> User:
    """Create a superuser for testing."""
    return await UserFactory.create_async(session=session, is_superuser=True, is_active=True)


@pytest.fixture
async def superuser_client(
    async_client: httpx.AsyncClient, superuser: User, test_app: FastAPI
) -> AsyncGenerator[httpx.AsyncClient]:
    """Provide an authenticated client with superuser privileges (via dependency override)."""
    test_app.dependency_overrides[current_active_superuser] = lambda: superuser
    test_app.dependency_overrides[current_active_user] = lambda: superuser
    test_app.dependency_overrides[current_active_verified_user] = lambda: superuser
    test_app.dependency_overrides[optional_current_active_user] = lambda: superuser
    yield async_client
    # Cleanup override
    test_app.dependency_overrides.pop(current_active_superuser, None)
    test_app.dependency_overrides.pop(current_active_user, None)
    test_app.dependency_overrides.pop(current_active_verified_user, None)
    test_app.dependency_overrides.pop(optional_current_active_user, None)
