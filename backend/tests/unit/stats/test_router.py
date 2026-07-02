"""Router contract tests for the system-wide stats endpoints.

Query functions are mocked — this tests HTTP shape, status codes, and
parameter handling, not the SQL queries themselves.
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.stats.router import router
from app.api.stats.schemas import CategoryStat, SeriesPoint, Totals
from app.core.cache import _cache_state, init_cache
from app.core.database import get_async_session

_NOW = datetime(2026, 6, 30, 6, 0, 0, tzinfo=UTC)

_FAKE_TOTALS = Totals(teardowns=10, parts=50, mass_kg=5.5, images=200, users=8)
_FAKE_CATEGORIES = [CategoryStat(name="Electronics", teardowns=6, parts=30)]
_FAKE_SERIES = [SeriesPoint(period="2026-06", teardowns=2, parts=10, mass_kg=1.1, images=40, users_new=1, users_active=1)]

@pytest.fixture
def client() -> TestClient:
    """Minimal FastAPI app with only the stats router, cache backed by in-memory."""
    # NOTE: init_cache(None) uses mem:// — no Redis needed, no network.
    # Reset state so init_cache runs fresh each time (idempotent guard otherwise skips it).
    _cache_state["initialized"] = False
    init_cache(None)
    app = FastAPI()
    # Override the DB session dep — queries are mocked so the session is never used
    app.dependency_overrides[get_async_session] = lambda: None
    app.include_router(router, prefix="/v1")
    return TestClient(app)

def test_returns_200_with_correct_shape(client: TestClient) -> None:
    with patch("app.api.stats.router.compute_totals", AsyncMock(return_value=(_FAKE_TOTALS, _NOW))):
        resp = client.get("/v1/stats/totals")
    assert resp.status_code == 200
    body = resp.json()
    assert body["totals"]["teardowns"] == 10
    assert body["totals"]["mass_kg"] == 5.5
    assert "generated_at" in body

def test_returns_200_with_categories(client: TestClient) -> None:
    mock = AsyncMock(return_value=(_FAKE_CATEGORIES, _NOW))
    with patch("app.api.stats.router.compute_categories", mock):
        resp = client.get("/v1/stats/categories")
    assert resp.status_code == 200
    body = resp.json()
    assert body["limit"] == 25
    assert body["categories"][0]["name"] == "Electronics"

def test_limit_param_forwarded(client: TestClient) -> None:
    mock = AsyncMock(return_value=(_FAKE_CATEGORIES, _NOW))
    with patch("app.api.stats.router.compute_categories", mock):
        resp = client.get("/v1/stats/categories?limit=10")
    assert resp.status_code == 200
    mock.assert_awaited_once()
    assert mock.call_args[0][1] == 10  # second positional arg is limit

def test_limit_above_100_rejected(client: TestClient) -> None:
    resp = client.get("/v1/stats/categories?limit=101")
    assert resp.status_code == 422

def test_limit_below_1_rejected(client: TestClient) -> None:
    resp = client.get("/v1/stats/categories?limit=0")
    assert resp.status_code == 422

def test_returns_200_with_series(client: TestClient) -> None:
    with patch("app.api.stats.router.compute_series", AsyncMock(return_value=(_FAKE_SERIES, _NOW))):
        resp = client.get("/v1/stats/series")
    assert resp.status_code == 200
    body = resp.json()
    assert body["granularity"] == "month"
    assert len(body["series"]) == 1
    assert body["series"][0]["period"] == "2026-06"

def test_invalid_granularity_rejected(client: TestClient) -> None:
    resp = client.get("/v1/stats/series?granularity=quarter")
    assert resp.status_code == 422

def test_explicit_dates_accepted(client: TestClient) -> None:
    with patch("app.api.stats.router.compute_series", AsyncMock(return_value=(_FAKE_SERIES, _NOW))):
        resp = client.get("/v1/stats/series?granularity=day&start=2025-01-01&end=2025-12-31")
    assert resp.status_code == 200

def test_invalid_date_format_rejected(client: TestClient) -> None:
    resp = client.get("/v1/stats/series?start=01/01/2025")
    assert resp.status_code == 422

def test_response_echoes_granularity(client: TestClient) -> None:
    with patch("app.api.stats.router.compute_series", AsyncMock(return_value=(_FAKE_SERIES, _NOW))):
        resp = client.get("/v1/stats/series?granularity=year")
    assert resp.json()["granularity"] == "year"
