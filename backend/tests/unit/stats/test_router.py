"""Router contract tests for the system-wide stats endpoints.

Query functions are mocked — this tests HTTP shape, status codes, and
parameter handling, not the SQL queries themselves.
"""

from datetime import UTC, datetime
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import FastAPI
from httpx import ASGITransport

from app.api.stats.router import router
from app.api.stats.schemas import CategoryScope, CategoryStat, SeriesPoint, Totals
from app.core.cache import _cache_state, init_cache
from app.core.database import get_async_session

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

_NOW = datetime(2026, 6, 30, 6, 0, 0, tzinfo=UTC)

_FAKE_TOTALS = Totals(teardowns=10, parts=50, mass_kg=5.5, images=200, users=8)
_FAKE_CATEGORIES = [CategoryStat(name="Electronics", count=6)]
_FAKE_SERIES = [
    SeriesPoint(period="2026-06", teardowns=2, parts=10, mass_kg=1.1, images=40, users_new=1, users_active=1)
]


@pytest.fixture
async def client() -> AsyncGenerator[httpx.AsyncClient]:
    """Minimal FastAPI app with only the stats router, cache backed by in-memory."""
    # NOTE: init_cache(None) uses mem:// — no Redis needed, no network.
    # Reset state so init_cache runs fresh each time (idempotent guard otherwise skips it).
    _cache_state["initialized"] = False
    init_cache(None)
    app = FastAPI()
    # Override the DB session dep — queries are mocked so the session is never used
    app.dependency_overrides[get_async_session] = lambda: None
    app.include_router(router, prefix="/v1")
    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="https://test") as client:
        yield client


async def test_returns_200_with_correct_shape(client: httpx.AsyncClient) -> None:
    """Returns 200 with correct shape."""
    with patch("app.api.stats.router.compute_totals", AsyncMock(return_value=(_FAKE_TOTALS, _NOW))):
        resp = await client.get("/v1/stats/totals")
    assert resp.status_code == 200
    body = resp.json()
    assert body["totals"]["teardowns"] == 10
    assert body["totals"]["mass_kg"] == 5.5
    assert "generated_at" in body


async def test_returns_200_with_categories(client: httpx.AsyncClient) -> None:
    """Returns 200 with categories."""
    mock = AsyncMock(return_value=(_FAKE_CATEGORIES, _NOW))
    with patch("app.api.stats.router.compute_categories", mock):
        resp = await client.get("/v1/stats/categories")
    assert resp.status_code == 200
    body = resp.json()
    assert body["limit"] == 25
    assert body["scope"] == "products"  # top-level products unless asked otherwise
    assert body["categories"][0] == {"name": "Electronics", "count": 6}


async def test_limit_param_forwarded(client: httpx.AsyncClient) -> None:
    """Limit param forwarded."""
    mock = AsyncMock(return_value=(_FAKE_CATEGORIES, _NOW))
    with patch("app.api.stats.router.compute_categories", mock):
        resp = await client.get("/v1/stats/categories?limit=10")
    assert resp.status_code == 200
    mock.assert_awaited_once()
    assert mock.call_args[0][1] == 10  # second positional arg is limit


@pytest.mark.parametrize("scope", ["products", "components", "all"])
async def test_scope_param_forwarded_and_echoed(client: httpx.AsyncClient, scope: str) -> None:
    """Scope reaches the query and is echoed back, so the client knows what it got."""
    mock = AsyncMock(return_value=(_FAKE_CATEGORIES, _NOW))
    with patch("app.api.stats.router.compute_categories", mock):
        resp = await client.get(f"/v1/stats/categories?scope={scope}")
    assert resp.status_code == 200
    assert resp.json()["scope"] == scope
    assert mock.call_args[0][2] == CategoryScope(scope)  # third positional arg is scope


@pytest.mark.parametrize(
    "query",
    [
        "/v1/stats/categories?limit=101",  # limit above max
        "/v1/stats/categories?limit=0",  # limit below min
        "/v1/stats/categories?scope=widgets",  # unknown scope
        "/v1/stats/series?granularity=quarter",  # invalid granularity
        "/v1/stats/series?start=01/01/2025",  # invalid date format
    ],
)
async def test_invalid_query_params_rejected(client: httpx.AsyncClient, query: str) -> None:
    """Out-of-range and malformed query params return 422."""
    assert (await client.get(query)).status_code == 422


async def test_returns_200_with_series(client: httpx.AsyncClient) -> None:
    """Returns 200 with series."""
    with patch("app.api.stats.router.compute_series", AsyncMock(return_value=(_FAKE_SERIES, _NOW))):
        resp = await client.get("/v1/stats/series")
    assert resp.status_code == 200
    body = resp.json()
    assert body["granularity"] == "month"
    assert len(body["series"]) == 1
    assert body["series"][0]["period"] == "2026-06"


async def test_explicit_dates_accepted(client: httpx.AsyncClient) -> None:
    """Explicit dates accepted."""
    with patch("app.api.stats.router.compute_series", AsyncMock(return_value=(_FAKE_SERIES, _NOW))):
        resp = await client.get("/v1/stats/series?granularity=day&start=2025-01-01&end=2025-12-31")
    assert resp.status_code == 200


async def test_response_echoes_granularity(client: httpx.AsyncClient) -> None:
    """Response echoes granularity."""
    with patch("app.api.stats.router.compute_series", AsyncMock(return_value=(_FAKE_SERIES, _NOW))):
        resp = await client.get("/v1/stats/series?granularity=year")
    assert resp.json()["granularity"] == "year"
