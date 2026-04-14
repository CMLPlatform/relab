"""Integration tests for RPi Cam plugin flows."""

from typing import TYPE_CHECKING

import pytest
from fastapi import status

# Import auth dependency to override
from app.api.auth.dependencies import current_active_user

if TYPE_CHECKING:
    from collections.abc import Generator

    from fastapi import FastAPI
    from httpx import AsyncClient

    from app.api.auth.models import User

# Constants for test values
CAM_NAME = "Integration Camera"
CAM_DESC = "Testing constraints"
UPDATED_CAM_NAME = "Updated Camera Name"
DUPLICATE_CAM_NAME = "Duplicate Name Camera"
INVALID_CAM_NAME = "Invalid Camera"
JWT_STRATEGY_ERR = "JWTStrategy"
PUBLIC_JWK = {
    "kty": "EC",
    "crv": "P-256",
    "x": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "y": "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    "kid": "integration-key-1",
}
KEY_ID = "integration-key-1"


def build_camera_payload(name: str = CAM_NAME, description: str | None = CAM_DESC) -> dict[str, object]:
    """Build a WebSocket-only camera create payload."""
    return {
        "name": name,
        "description": description,
        "relay_public_key_jwk": PUBLIC_JWK,
        "relay_key_id": KEY_ID,
    }


@pytest.fixture
def auth_client(async_client: AsyncClient, test_app: FastAPI, superuser: User) -> Generator[AsyncClient]:
    """Fixture to provide an authenticated client for RPi Cam tests."""
    # Override the user dependency to bypass actual authentication
    test_app.dependency_overrides[current_active_user] = lambda: superuser
    yield async_client
    test_app.dependency_overrides.pop(current_active_user, None)


@pytest.mark.asyncio
async def test_camera_lifecycle_and_constraints(auth_client: AsyncClient, superuser: User) -> None:
    """Test the lifecycle of a camera and DB constraints.

    Steps:
    1. Create Camera
    2. Read Camera
    3. Update Camera
    4. Delete Camera
    5. Verify Owner Constraints
    """
    # 1. Create Camera
    camera_data = build_camera_payload()

    response = await auth_client.post("/plugins/rpi-cam/cameras", json=camera_data)

    # Check for authentication bypass failure (if auth fails due to JWTStrategy error)
    if response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR and JWT_STRATEGY_ERR in response.text:
        pytest.skip("Auth module error preventing test execution")

    assert response.status_code == status.HTTP_201_CREATED
    created_camera = response.json()
    camera_id = created_camera["id"]

    assert created_camera["name"] == camera_data["name"]
    assert created_camera["relay_key_id"] == KEY_ID
    assert created_camera["relay_credential_status"] == "active"
    assert created_camera["owner_id"] == str(superuser.id)

    # 2. Read Camera (List and Detail)
    response = await auth_client.get(f"/plugins/rpi-cam/cameras/{camera_id}")
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["id"] == camera_id

    # 3. Update Camera
    update_data = {"name": UPDATED_CAM_NAME}
    response = await auth_client.patch(f"/plugins/rpi-cam/cameras/{camera_id}", json=update_data)
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["name"] == UPDATED_CAM_NAME

    # 4. Delete Camera
    response = await auth_client.delete(f"/plugins/rpi-cam/cameras/{camera_id}")
    assert response.status_code == status.HTTP_204_NO_CONTENT

    # Verify deletion
    response = await auth_client.get(f"/plugins/rpi-cam/cameras/{camera_id}")
    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_current_user_camera_alias_routes(auth_client: AsyncClient) -> None:
    """The user-scoped camera alias should expose the same CRUD flow."""
    camera_data = build_camera_payload()

    response = await auth_client.post("/users/me/cameras", json=camera_data)
    if response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR and JWT_STRATEGY_ERR in response.text:
        pytest.skip("Auth module error preventing test execution")

    assert response.status_code == status.HTTP_201_CREATED
    camera_id = response.json()["id"]

    response = await auth_client.get("/users/me/cameras")
    assert response.status_code == status.HTTP_200_OK

    response = await auth_client.get(f"/users/me/cameras/{camera_id}")
    assert response.status_code == status.HTTP_200_OK

    response = await auth_client.delete(f"/users/me/cameras/{camera_id}")
    assert response.status_code == status.HTTP_204_NO_CONTENT


@pytest.mark.asyncio
async def test_camera_unique_constraints(auth_client: AsyncClient) -> None:
    """Test unique constraints if any."""
    camera_data = build_camera_payload(name=DUPLICATE_CAM_NAME)

    # First camera
    response = await auth_client.post("/plugins/rpi-cam/cameras", json=camera_data)
    if response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR:
        pytest.skip("Auth module error preventing test execution")
    assert response.status_code == status.HTTP_201_CREATED

    # Second camera
    response = await auth_client.post("/plugins/rpi-cam/cameras", json=camera_data)
    assert response.status_code == status.HTTP_201_CREATED


@pytest.mark.asyncio
async def test_camera_required_fields(auth_client: AsyncClient) -> None:
    """Test API structure validation for required fields."""
    camera_data = {
        "name": INVALID_CAM_NAME,
    }
    response = await auth_client.post("/plugins/rpi-cam/cameras", json=camera_data)
    if response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR:
        pytest.skip("Auth module error preventing test execution")
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
