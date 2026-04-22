"""Integration tests for HTTP error response shapes.

Verifies that authentication failures, authorisation failures, missing
resources, and invalid payloads all return the expected status codes and
response bodies.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from fastapi import FastAPI, HTTPException, status

from app.api.auth.dependencies import current_active_superuser
from tests.factories.models import UserFactory
from tests.fixtures.client import override_authenticated_user

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.api
class TestUnauthenticated:
    """Endpoints that require authentication must return 401 when no credentials are sent."""

    async def test_create_product_without_auth_returns_401(self, api_client: AsyncClient) -> None:
        """POST /products requires a verified user; anonymous request → 401."""
        response = await api_client.post("/products", json={})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_get_me_without_auth_returns_401_with_detail(self, api_client: AsyncClient) -> None:
        """GET /users/me requires authentication and returns the standard error shape."""
        response = await api_client.get("/users/me")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        body = response.json()
        assert "detail" in body


@pytest.mark.api
class TestForbidden:
    """Superuser-only endpoints must return 403 when called by an ordinary user."""

    @pytest.fixture
    async def regular_user_client(
        self,
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

    async def test_admin_taxonomy_create_as_regular_user_returns_403(self, regular_user_client: AsyncClient) -> None:
        """POST /admin/taxonomies is superuser-only; regular user → 403."""
        data = {"name": "Forbidden Taxonomy", "version": "v1", "domains": ["materials"]}
        response = await regular_user_client.post("/admin/taxonomies", json=data)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    async def test_403_response_has_detail_key(self, regular_user_client: AsyncClient) -> None:
        """403 responses must include a 'detail' key."""
        response = await regular_user_client.post("/admin/taxonomies", json={})
        assert response.status_code == status.HTTP_403_FORBIDDEN
        body = response.json()
        assert "detail" in body


@pytest.mark.api
class TestNotFound:
    """Requests for non-existent resources must return 404."""

    async def test_get_nonexistent_taxonomy_returns_404_with_detail(self, api_client_light: AsyncClient) -> None:
        """GET /taxonomies/{id} with an id that does not exist returns the standard error shape."""
        response = await api_client_light.get("/taxonomies/999999")
        assert response.status_code == status.HTTP_404_NOT_FOUND
        body = response.json()
        assert "detail" in body

    async def test_get_nonexistent_material_returns_404(self, api_client_light: AsyncClient) -> None:
        """GET /materials/{id} with an id that does not exist → 404."""
        response = await api_client_light.get("/materials/999999")
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.api
class TestUnprocessableEntity:
    """Invalid request bodies must return 422 with structured error details."""

    async def test_create_taxonomy_missing_required_fields_returns_structured_422(
        self, api_client_superuser: AsyncClient
    ) -> None:
        """POST /admin/taxonomies with an empty body → 422 with validation error objects."""
        response = await api_client_superuser.post("/admin/taxonomies", json={})
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
        body = response.json()
        assert "detail" in body
        assert isinstance(body["detail"], list)
        errors = body["detail"]
        assert len(errors) > 0
        for error in errors:
            assert "loc" in error, f"Missing 'loc' in error: {error}"
            assert "msg" in error, f"Missing 'msg' in error: {error}"
            assert "type" in error, f"Missing 'type' in error: {error}"

    async def test_create_material_with_negative_density_returns_422(self, api_client_superuser: AsyncClient) -> None:
        """Materials with negative density must fail schema validation with 422."""
        data = {"name": "Bad Material", "density_kg_m3": -500.0}
        response = await api_client_superuser.post("/admin/materials", json=data)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
