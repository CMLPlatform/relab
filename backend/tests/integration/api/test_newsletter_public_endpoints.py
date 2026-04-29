"""Regression tests for removed public newsletter endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from fastapi import status

if TYPE_CHECKING:
    from httpx import AsyncClient


pytestmark = pytest.mark.api


async def test_subscribe_endpoint_is_not_exposed(api_client: AsyncClient) -> None:
    """The removed public signup route should return 404."""
    response = await api_client.post("/v1/newsletter/subscribe", json="new@example.com")

    assert response.status_code == status.HTTP_404_NOT_FOUND
