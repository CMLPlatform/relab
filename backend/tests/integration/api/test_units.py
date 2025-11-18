"""Integration tests for units endpoint."""

import pytest
from httpx import AsyncClient


class TestUnitsEndpoint:
    """Test the /units endpoint."""

    async def test_get_units(self, async_client: AsyncClient) -> None:
        """Test getting the list of supported units."""
        response = await async_client.get("/units")

        assert response.status_code == 200
        units = response.json()

        # Verify expected units are present
        assert isinstance(units, list)
        assert "kg" in units or "g" in units
        assert "cm" in units or "m" in units

    async def test_units_includes_grams(self, async_client: AsyncClient) -> None:
        """Test that grams unit is included (recent feature change from kg to g)."""
        response = await async_client.get("/units")

        assert response.status_code == 200
        units = response.json()

        # After the recent feature change, g should be included
        assert "g" in units
