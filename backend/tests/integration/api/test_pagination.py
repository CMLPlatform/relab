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

    async def test_response_contains_pagination_metadata(
        self, api_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """The response must include total, page, size, and pages keys."""
        await MaterialFactory.create_async(session=db_session)
        response = await api_client.get("/materials")
        body = response.json()
        for key in ("total", "page", "size", "pages"):
            assert key in body, f"Missing pagination key: '{key}'"

    async def test_total_reflects_item_count(self, api_client: AsyncClient, db_session: AsyncSession) -> None:
        """Total must equal the number of materials in the database."""
        for i in range(3):
            await MaterialFactory.create_async(session=db_session, name=f"PaginationMaterial{i}")
        response = await api_client.get("/materials")
        body = response.json()
        assert body["total"] == len(body["items"])

    async def test_size_limits_returned_items(self, api_client: AsyncClient, db_session: AsyncSession) -> None:
        """?size=1 must return exactly one item regardless of total."""
        for i in range(3):
            await MaterialFactory.create_async(session=db_session, name=f"SizeMaterial{i}")
        response = await api_client.get("/materials?size=1")
        body = response.json()
        assert len(body["items"]) == 1

    async def test_pages_metadata_matches_size_and_total(
        self, api_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """With 3 items and size=2, pages must equal 2."""
        for i in range(3):
            await MaterialFactory.create_async(session=db_session, name=f"PageMeta{i}")
        response = await api_client.get("/materials?size=2")
        body = response.json()
        assert body["total"] >= 3
        assert body["size"] == 2
        assert body["pages"] >= 2

    async def test_page_beyond_total_returns_empty_items(
        self, api_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Requesting a page past the last page must return an empty items list."""
        await MaterialFactory.create_async(session=db_session)
        response = await api_client.get("/materials?size=1&page=9999")
        body = response.json()
        assert body["items"] == []


@pytest.mark.api
class TestPaginationSmoke:
    """One smoke test per newly-paginated endpoint: confirms the Page envelope is returned."""

    @pytest.mark.parametrize(
        ("path", "factory"),
        [
            ("/taxonomies", TaxonomyFactory),
            ("/product-types", ProductTypeFactory),
        ],
    )
    async def test_endpoint_returns_page_envelope(
        self,
        api_client: AsyncClient,
        db_session: AsyncSession,
        path: str,
        factory: type[TaxonomyFactory | ProductTypeFactory],
    ) -> None:
        """Representative paginated endpoints must return a Page envelope."""
        await factory.create_async(session=db_session)
        response = await api_client.get(path)
        assert response.status_code == status.HTTP_200_OK
        assert "items" in response.json()

    async def test_organizations_returns_page_envelope(
        self, api_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """GET /organizations must return a Page envelope."""
        owner = await UserFactory.create_async(session=db_session)
        await OrganizationFactory.create_async(session=db_session, owner_id=owner.id)
        response = await api_client.get("/organizations")
        assert response.status_code == status.HTTP_200_OK
        assert "items" in response.json()

    async def test_admin_users_returns_page_envelope(self, api_client_superuser: AsyncClient) -> None:
        """GET /admin/users must return a Page envelope."""
        response = await api_client_superuser.get("/admin/users")
        assert response.status_code == status.HTTP_200_OK
        assert "items" in response.json()
