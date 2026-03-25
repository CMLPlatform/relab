"""Integration tests for OpenAPI schema generation endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from fastapi import status

if TYPE_CHECKING:
    from httpx import AsyncClient


@pytest.mark.integration
class TestOpenAPIEndpoints:
    """Tests for public and full OpenAPI schema generation."""

    async def test_public_openapi_json_can_be_generated(self, async_client: AsyncClient) -> None:
        """The public OpenAPI schema endpoint should return valid JSON."""
        response = await async_client.get("/openapi.json")

        assert response.status_code == status.HTTP_200_OK
        payload = response.json()
        assert payload["openapi"].startswith("3.")
        assert isinstance(payload["paths"], dict)
        assert payload["paths"]
        assert "x-tagGroups" in payload
        assert "/auth/bearer/login" in payload["paths"]
        assert "/admin/materials" not in payload["paths"]

    async def test_full_openapi_json_can_be_generated(self, superuser_client: AsyncClient) -> None:
        """The full OpenAPI schema endpoint should render successfully for a superuser."""
        response = await superuser_client.get("/openapi_full.json")

        assert response.status_code == status.HTTP_200_OK
        payload = response.json()
        assert payload["openapi"].startswith("3.")
        assert isinstance(payload["paths"], dict)
        assert payload["paths"]
        assert "/admin/materials" in payload["paths"]
        assert "/auth/oauth/google/session/authorize" in payload["paths"]
