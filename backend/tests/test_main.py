"""Main test module for the application."""

from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from httpx import Response


def test_read_units(client: TestClient) -> None:
    """Test the units endpoint."""
    response: Response = client.get("/units")
    assert response.status_code == 200
    assert response.json() == ["kg", "g", "m", "cm"]


def test_read_items(client: TestClient) -> None:
    """Test the items endpoint."""
    response: Response = client.get("/file-storage/videos")
    assert response.status_code == 200
    assert response.json() == []
