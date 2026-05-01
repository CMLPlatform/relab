"""Integration tests for RPi Cam plugin flows."""

from typing import TYPE_CHECKING

import pytest
from fastapi import status

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User

from app.api.plugins.rpi_cam.models import Camera

pytestmark = pytest.mark.flow

# Constants for test values
CAM_NAME = "Integration Camera"
CAM_DESC = "Testing constraints"
UPDATED_CAM_NAME = "Updated Camera Name"
DUPLICATE_CAM_NAME = "Duplicate Name Camera"
INVALID_CAM_NAME = "Invalid Camera"
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


async def test_camera_lifecycle_and_constraints(api_client_superuser: AsyncClient, db_superuser: User) -> None:
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

    response = await api_client_superuser.post("/v1/plugins/rpi-cam/cameras", json=camera_data)

    assert response.status_code == status.HTTP_201_CREATED
    created_camera = response.json()
    camera_id = created_camera["id"]

    assert created_camera["name"] == camera_data["name"]
    assert created_camera["relay_key_id"] == KEY_ID
    assert created_camera["relay_credential_status"] == "active"
    assert created_camera["owner_id"] == str(db_superuser.id)

    # 2. Read Camera (List and Detail)
    response = await api_client_superuser.get(f"/v1/plugins/rpi-cam/cameras/{camera_id}")
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["id"] == camera_id

    # 3. Update Camera
    update_data = {"name": UPDATED_CAM_NAME}
    response = await api_client_superuser.patch(f"/v1/plugins/rpi-cam/cameras/{camera_id}", json=update_data)
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["name"] == UPDATED_CAM_NAME

    # 4. Delete Camera
    response = await api_client_superuser.delete(f"/v1/plugins/rpi-cam/cameras/{camera_id}")
    assert response.status_code == status.HTTP_204_NO_CONTENT

    # Verify deletion
    response = await api_client_superuser.get(f"/v1/plugins/rpi-cam/cameras/{camera_id}")
    assert response.status_code == status.HTTP_404_NOT_FOUND


async def test_plugin_camera_routes(api_client_superuser: AsyncClient) -> None:
    """The plugin-scoped camera route should expose the CRUD flow."""
    camera_data = build_camera_payload()

    response = await api_client_superuser.post("/v1/plugins/rpi-cam/cameras", json=camera_data)
    assert response.status_code == status.HTTP_201_CREATED
    camera_id = response.json()["id"]

    response = await api_client_superuser.get("/v1/plugins/rpi-cam/cameras")
    assert response.status_code == status.HTTP_200_OK

    response = await api_client_superuser.get(f"/v1/plugins/rpi-cam/cameras/{camera_id}")
    assert response.status_code == status.HTTP_200_OK

    response = await api_client_superuser.delete(f"/v1/plugins/rpi-cam/cameras/{camera_id}")
    assert response.status_code == status.HTTP_204_NO_CONTENT


async def test_non_owner_cannot_access_camera(
    api_client_user: AsyncClient,
    db_session: AsyncSession,
    db_superuser: User,
) -> None:
    """User-scoped camera routes hide cameras owned by another user."""
    camera = Camera(
        name="Owner Camera",
        description="Owned elsewhere",
        owner_id=db_superuser.id,
        relay_public_key_jwk=PUBLIC_JWK,
        relay_key_id=KEY_ID,
    )
    db_session.add(camera)
    await db_session.flush()

    get_response = await api_client_user.get(f"/v1/plugins/rpi-cam/cameras/{camera.id}")
    status_response = await api_client_user.get(f"/v1/plugins/rpi-cam/cameras/{camera.id}/status")
    patch_response = await api_client_user.patch(
        f"/v1/plugins/rpi-cam/cameras/{camera.id}",
        json={"name": UPDATED_CAM_NAME},
    )
    delete_response = await api_client_user.delete(f"/v1/plugins/rpi-cam/cameras/{camera.id}")

    assert get_response.status_code == status.HTTP_404_NOT_FOUND
    assert status_response.status_code == status.HTTP_404_NOT_FOUND
    assert patch_response.status_code == status.HTTP_404_NOT_FOUND
    assert delete_response.status_code == status.HTTP_404_NOT_FOUND


async def test_camera_unique_constraints(api_client_superuser: AsyncClient) -> None:
    """Test unique constraints if any."""
    camera_data = build_camera_payload(name=DUPLICATE_CAM_NAME)

    # First camera
    response = await api_client_superuser.post("/v1/plugins/rpi-cam/cameras", json=camera_data)
    assert response.status_code == status.HTTP_201_CREATED

    # Second camera
    response = await api_client_superuser.post("/v1/plugins/rpi-cam/cameras", json=camera_data)
    assert response.status_code == status.HTTP_201_CREATED


async def test_camera_required_fields(api_client_superuser: AsyncClient) -> None:
    """Test API structure validation for required fields."""
    camera_data = {
        "name": INVALID_CAM_NAME,
    }
    response = await api_client_superuser.post("/v1/plugins/rpi-cam/cameras", json=camera_data)
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
