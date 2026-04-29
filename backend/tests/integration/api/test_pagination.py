"""Integration tests for shared pagination behaviour.

These tests verify the Page envelope shape and parameter semantics
(page, size, total, pages) using the /materials endpoint as the
representative paginated list. Smoke tests for each newly-paginated
router are included at the end.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from fastapi import status

from tests.factories.models import (
    MaterialFactory,
    OrganizationFactory,
    ProductTypeFactory,
    TaxonomyFactory,
    UserFactory,
)

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.api
class TestPaginationEnvelope:
    """The Page response envelope must always be present and well-formed."""

    async def test_response_contains_consistent_pagination_metadata(
        self, api_client_light: AsyncClient, db_session: AsyncSession
    ) -> None:
        """The response must include the standard envelope and consistent totals."""
        for i in range(3):
            await MaterialFactory.create_async(session=db_session, name=f"PaginationMaterial{i}")
        response = await api_client_light.get("/v1/materials")
        body = response.json()
        for key in ("total", "page", "size", "pages"):
            assert key in body, f"Missing pagination key: '{key}'"
        assert body["total"] == len(body["items"])

    async def test_size_and_pages_parameters_are_applied(
        self, api_client_light: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Pagination parameters should limit returned items and report page counts."""
        for i in range(3):
            await MaterialFactory.create_async(session=db_session, name=f"PageMeta{i}")
        response = await api_client_light.get("/v1/materials?size=2&page=1")
        body = response.json()
        assert body["total"] >= 3
        assert body["size"] == 2
        assert body["pages"] >= 2
        assert len(body["items"]) == 2

    async def test_page_beyond_total_returns_empty_items(
        self, api_client_light: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Requesting a page past the last page must return an empty items list."""
        await MaterialFactory.create_async(session=db_session)
        response = await api_client_light.get("/v1/materials?size=1&page=9999")
        body = response.json()
        assert body["items"] == []


@pytest.mark.api
class TestPaginationSmoke:
    """One smoke test per newly-paginated endpoint: confirms the Page envelope is returned."""

    @pytest.mark.parametrize(
        ("path", "factory"),
        [
            ("/v1/taxonomies", TaxonomyFactory),
            ("/v1/product-types", ProductTypeFactory),
        ],
    )
    async def test_endpoint_returns_page_envelope(
        self,
        api_client_light: AsyncClient,
        db_session: AsyncSession,
        path: str,
        factory: type[TaxonomyFactory | ProductTypeFactory],
    ) -> None:
        """Representative paginated endpoints must return a Page envelope."""
        await factory.create_async(session=db_session)
        response = await api_client_light.get(path)
        assert response.status_code == status.HTTP_200_OK
        assert "items" in response.json()

    async def test_organizations_returns_page_envelope(
        self, api_client_light: AsyncClient, db_session: AsyncSession
    ) -> None:
        """GET /organizations must return a Page envelope."""
        owner = await UserFactory.create_async(session=db_session)
        await OrganizationFactory.create_async(session=db_session, owner_id=owner.id)
        response = await api_client_light.get("/v1/organizations")
        assert response.status_code == status.HTTP_200_OK
        assert "items" in response.json()

    async def test_admin_users_returns_page_envelope(self, api_client_superuser_light: AsyncClient) -> None:
        """GET /admin/users must return a Page envelope."""
        response = await api_client_superuser_light.get("/v1/admin/users")
        assert response.status_code == status.HTTP_200_OK
        assert "items" in response.json()
