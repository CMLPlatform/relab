"""HTTP Client fixtures for API testing."""

import httpx
import pytest
from collections.abc import AsyncGenerator
from httpx import ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session
from app.main import app


@pytest.fixture
def test_app():
    """Provide fresh FastAPI app instance.

    Yields app with cleared dependency overrides after each test.
    """
    yield app
    app.dependency_overrides.clear()


@pytest.fixture
async def async_client(test_app, session: AsyncSession) -> AsyncGenerator[httpx.AsyncClient]:
    """Provide async HTTP client for API testing.

    Uses httpx.AsyncClient for true async testing of ASGI application.
    Automatically injects test database session.
    """

    async def override_get_session() -> AsyncGenerator[AsyncSession]:
        yield session

    test_app.dependency_overrides[get_async_session] = override_get_session

    async with httpx.AsyncClient(
        transport=ASGITransport(app=test_app),
        base_url="http://test",
        follow_redirects=True,
    ) as client:
        yield client

    test_app.dependency_overrides.clear()


@pytest.fixture
async def superuser(session: AsyncSession) -> "User":
    """Create a superuser for testing."""
    from app.api.auth.models import User
    from tests.factories.models import UserFactory

    user = await UserFactory.create_async(session=session, is_superuser=True, is_active=True)
    return user


@pytest.fixture
async def superuser_client(async_client: httpx.AsyncClient, superuser: "User", test_app) -> AsyncGenerator[httpx.AsyncClient, None]:
    """Provide an authenticated client with superuser privileges (via dependency override)."""
    from app.api.auth.dependencies import current_active_superuser

    test_app.dependency_overrides[current_active_superuser] = lambda: superuser
    yield async_client
    # Cleanup override
    test_app.dependency_overrides.pop(current_active_superuser, None)
