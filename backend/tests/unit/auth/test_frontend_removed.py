"""Regression tests for keeping the backend API-only."""

from __future__ import annotations

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient

from app.main import create_app

pytestmark = pytest.mark.anyio


@pytest.mark.parametrize("path", ["/", "/login", "/v1/", "/v1/login"])
async def test_backend_frontend_pages_are_not_registered(path: str) -> None:
    """Human-facing pages should live outside the backend service."""
    app = create_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://api.example.test") as client:
        response = await client.get(path)

    assert response.status_code == status.HTTP_404_NOT_FOUND
