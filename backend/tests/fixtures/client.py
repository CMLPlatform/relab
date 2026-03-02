"""HTTP Client fixtures for API testing."""

from __future__ import annotations

from typing import TYPE_CHECKING

import httpx
import pytest
from fastapi import FastAPI
from fastapi_cache import FastAPICache
from fastapi_cache.backends.inmemory import InMemoryBackend
from httpx import ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.dependencies import current_active_superuser, current_active_user, current_active_verified_user
from app.api.auth.models import User
from app.api.auth.utils.rate_limit import limiter
from app.core.database import get_async_session
from app.main import app
from tests.factories.models import UserFactory

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator, Generator

    from redis.asyncio import Redis


@pytest.fixture
def test_app() -> Generator[FastAPI]:
    """Provide fresh FastAPI app instance.

    Yields app with cleared dependency overrides after each test.
    """
    yield app
    app.dependency_overrides.clear()


@pytest.fixture
async def async_client(
    test_app: FastAPI, session: AsyncSession, mock_redis_dependency: AsyncGenerator[Redis]
) -> AsyncGenerator[httpx.AsyncClient]:
    """Provide async HTTP client for API testing.

    Uses httpx.AsyncClient for true async testing of ASGI application.
    Automatically injects test database session.
    Disables rate limiting for tests.
    Sets up Redis for on_after_login hooks.
    """

    async def override_get_session() -> AsyncGenerator[AsyncSession]:
        yield session

    test_app.dependency_overrides[get_async_session] = override_get_session

    # Disable rate limiting in tests
    limiter.enabled = False

    # Set up redis for on_after_login hooks
    test_app.state.redis = mock_redis_dependency

    # Setup in-memory cache for FastAPI Cache
    FastAPICache.init(InMemoryBackend(), prefix="test-cache")

    async with httpx.AsyncClient(
        transport=ASGITransport(app=test_app),
        base_url="http://test",
        follow_redirects=True,
    ) as client:
        yield client

    # Cleanup
    test_app.state.redis = None
    # Re-enable rate limiting after tests
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
    yield async_client
    # Cleanup override
    test_app.dependency_overrides.pop(current_active_superuser, None)
    test_app.dependency_overrides.pop(current_active_user, None)
    test_app.dependency_overrides.pop(current_active_verified_user, None)
