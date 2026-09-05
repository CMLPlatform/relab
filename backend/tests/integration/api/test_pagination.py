"""Integration tests for shared pagination behaviour.

pytestmark = pytest.mark.api
These tests verify the Page envelope shape and parameter semantics
(page, size, total, pages) using the /materials endpoint as the
representative paginated list. Smoke tests for each newly-paginated
router are included at the end.
"""

from typing import TYPE_CHECKING

import pytest
from fastapi import status

from app.api.reference_data.models import CategoryMaterialLink
from tests.factories.models import (
    CategoryFactory,
    MaterialFactory,
    ProductTypeFactory,
    TaxonomyFactory,
)

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.reference_data.models import Taxonomy


async def test_response_contains_consistent_pagination_metadata(
    api_client_light: AsyncClient, db_session: AsyncSession
) -> None:
    """The response must include the standard envelope and consistent totals."""
    for i in range(3):
        await MaterialFactory.create_async(session=db_session, name=f"PaginationMaterial{i}")
    response = await api_client_light.get("/v1/materials")
    body = response.json()
    for key in ("total", "page", "size", "pages"):
        assert key in body, f"Missing pagination key: '{key}'"
    assert body["total"] == len(body["items"])


async def test_size_and_pages_parameters_are_applied(api_client_light: AsyncClient, db_session: AsyncSession) -> None:
    """Pagination parameters should limit returned items and report page counts."""
    for i in range(3):
        await MaterialFactory.create_async(session=db_session, name=f"PageMeta{i}")
    response = await api_client_light.get("/v1/materials?size=2&page=1")
    body = response.json()
    assert body["total"] >= 3
    assert body["size"] == 2
    assert body["pages"] >= 2
    assert len(body["items"]) == 2


async def test_page_beyond_total_returns_empty_items(api_client_light: AsyncClient, db_session: AsyncSession) -> None:
    """Requesting a page past the last page must return an empty items list."""
    await MaterialFactory.create_async(session=db_session)
    response = await api_client_light.get("/v1/materials?size=1&page=9999")
    body = response.json()
    assert body["items"] == []


async def test_paging_without_a_sort_never_repeats_or_drops_rows(
    api_client_light: AsyncClient, db_session: AsyncSession
) -> None:
    """Walking every page of an unsorted list must yield each row exactly once.

    LIMIT/OFFSET over a query with no ORDER BY has no defined row order, so
    without the primary-key fallback Postgres may hand back the same row on two
    pages and never return another.
    """
    created = {f"StablePaging{i}" for i in range(10)}
    for name in created:
        await MaterialFactory.create_async(session=db_session, name=name)

    seen: list[str] = []
    page = 1
    while True:
        body = (await api_client_light.get(f"/v1/materials?size=3&page={page}")).json()
        if not body["items"]:
            break
        seen.extend(item["name"] for item in body["items"])
        page += 1

    assert len(seen) == len(set(seen)), "a row was returned on more than one page"
    assert created <= set(seen), "a row never appeared on any page"


@pytest.mark.parametrize(
    ("path", "factory"),
    [
        ("/v1/taxonomies", TaxonomyFactory),
        ("/v1/product-types", ProductTypeFactory),
    ],
)
async def test_endpoint_returns_page_envelope(
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


async def test_admin_users_returns_page_envelope(api_client_superuser_light: AsyncClient) -> None:
    """GET /admin/users must return a Page envelope."""
    response = await api_client_superuser_light.get("/v1/admin/users")
    assert response.status_code == status.HTTP_200_OK
    assert "items" in response.json()


@pytest.mark.parametrize(
    ("path", "sort_field"),
    [
        ("/v1/products", "product_type_name"),
        ("/v1/categories", "taxonomy_name"),
    ],
)
async def test_sorting_by_joined_column_does_not_error(
    api_client_light: AsyncClient, db_session: AsyncSession, path: str, sort_field: str
) -> None:
    """Sorting on a relationship column must not trip Postgres 42P10 under SELECT DISTINCT.

    paginate_select applies .distinct(), and Postgres requires every ORDER BY
    expression to appear in the select list, so a joined sort column has to be
    added there explicitly.

    Materials' `category_name` is filterable but not sortable (it's a many-to-many
    relationship — see test_material_category_name_sort_is_rejected below), so it's
    excluded here.
    """
    await MaterialFactory.create_async(session=db_session, name="JoinedSortMaterial")
    response = await api_client_light.get(f"{path}?order_by={sort_field}")
    assert response.status_code == status.HTTP_200_OK, response.text
    assert "items" in response.json()


async def test_many_to_many_filter_returns_each_material_once(
    api_client_light: AsyncClient,
    db_session: AsyncSession,
    db_taxonomy: Taxonomy,
) -> None:
    """A material sitting in two matching categories is one row, not two.

    The category_name filter joins through categorymateriallink, so the join
    yields the material once per matching category. paginate_select applies
    DISTINCT to joined queries precisely to collapse that back; without it the
    material would appear twice in items and be double-counted in total.
    """
    material = await MaterialFactory.create_async(session=db_session, name="DedupeMaterial")
    for _ in range(2):
        category = await CategoryFactory.create_async(
            session=db_session, taxonomy_id=db_taxonomy.id, name="DedupeCategory"
        )
        db_session.add(CategoryMaterialLink(category_id=category.id, material_id=material.id))
    await db_session.flush()

    response = await api_client_light.get("/v1/materials?category_name=DedupeCategory")
    assert response.status_code == status.HTTP_200_OK, response.text

    payload = response.json()
    assert [item["name"] for item in payload["items"]] == ["DedupeMaterial"]
    assert payload["total"] == 1


async def test_material_category_name_sort_is_rejected(api_client_light: AsyncClient) -> None:
    """category_name is a many-to-many field; it must stay out of sortable_fields.

    Sorting on it via the add-columns+DISTINCT mechanism would duplicate rows across
    pages (once per category), breaking pagination — so the API must reject it rather
    than silently mis-paginate.
    """
    response = await api_client_light.get("/v1/materials?order_by=category_name")
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT, response.text
