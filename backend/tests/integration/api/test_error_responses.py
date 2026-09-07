"""Integration tests for HTTP error response shapes.

pytestmark = pytest.mark.api
Verifies that authentication failures, authorisation failures, missing
resources, and invalid payloads all return the expected status codes and
response bodies.
"""

from typing import TYPE_CHECKING

import pytest
from fastapi import FastAPI, HTTPException, status
from httpx import ASGITransport, AsyncClient

from app.api.auth.dependencies import current_active_superuser
from app.core.http_headers import SENSITIVE_CACHE_CONTROL
from tests.factories.models import UserFactory
from tests.fixtures.client import override_authenticated_user

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from sqlalchemy.ext.asyncio import AsyncSession


async def test_create_product_without_auth_returns_401(api_client: AsyncClient) -> None:
    """POST /products requires a verified user; anonymous request → 401."""
    response = await api_client.post("/v1/products", json={})
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


async def test_get_me_without_auth_returns_401_with_detail(api_client: AsyncClient) -> None:
    """GET /users/me requires authentication and returns the standard error shape."""
    response = await api_client.get("/v1/users/me")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.headers["cache-control"] == SENSITIVE_CACHE_CONTROL
    body = response.json()
    assert "detail" in body


@pytest.fixture
async def regular_user_client(
    api_client: AsyncClient,
    db_session: AsyncSession,
    test_app: FastAPI,
) -> AsyncGenerator[AsyncClient]:
    """Authenticated client for a non-superuser.

    Overrides current_active_superuser to raise 403, simulating what
    FastAPI-Users does when a verified-but-not-superuser hits a superuser
    endpoint.
    """

    def raise_forbidden() -> None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)

    user = await UserFactory.create_async(session=db_session, is_superuser=False, is_active=True)
    with override_authenticated_user(test_app, user, optional=False):
        test_app.dependency_overrides[current_active_superuser] = raise_forbidden
        yield api_client
        test_app.dependency_overrides.pop(current_active_superuser, None)


async def test_admin_taxonomy_create_as_regular_user_returns_403(regular_user_client: AsyncClient) -> None:
    """POST /admin/taxonomies is superuser-only; regular user → 403 with the standard error shape."""
    data = {"name": "Forbidden Taxonomy", "version": "v1", "domains": ["materials"]}
    response = await regular_user_client.post("/v1/admin/taxonomies", json=data)
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.headers["cache-control"] == SENSITIVE_CACHE_CONTROL
    assert "detail" in response.json()


async def test_get_nonexistent_taxonomy_returns_404_with_detail(api_client_light: AsyncClient) -> None:
    """GET /taxonomies/{id} with an id that does not exist returns the standard error shape."""
    response = await api_client_light.get("/v1/taxonomies/999999")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    body = response.json()
    assert "detail" in body


async def test_unhandled_exception_returns_generic_problem_details(test_app: FastAPI) -> None:
    """Unhandled runtime errors are not exposed to clients."""

    @test_app.get("/test/unhandled-error")
    async def raise_unhandled_error() -> None:
        message = "database password leaked in stack trace"
        raise RuntimeError(message)

    async with AsyncClient(
        transport=ASGITransport(app=test_app, raise_app_exceptions=False),
        base_url="http://test",
    ) as client:
        response = await client.get("/test/unhandled-error")

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.headers["cache-control"] == SENSITIVE_CACHE_CONTROL
    body = response.json()
    assert body["detail"] == "Internal server error"
    assert body["code"] == "RuntimeError"
    assert "database password" not in response.text
