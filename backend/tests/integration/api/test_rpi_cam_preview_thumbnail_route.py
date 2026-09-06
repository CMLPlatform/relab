"""Route tests for the owner-checked camera preview thumbnail."""

from typing import TYPE_CHECKING

import pytest
from fastapi import status

from app.api.auth.models import User  # runtime import kept for the fixture annotation
from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.runtime.preview import get_preview_thumbnail_path

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.api


@pytest.fixture
async def owned_camera(db_session: AsyncSession, db_superuser: User) -> Camera:
    """A camera belonging to the authenticated user."""
    camera = Camera(
        name="Bench camera",
        owner_id=db_superuser.id,
        relay_public_key_jwk={"kty": "EC", "crv": "P-256", "x": "AAA", "y": "BBB", "kid": "preview-key"},
        relay_key_id="preview-key",
    )
    db_session.add(camera)
    await db_session.flush()
    return camera


async def test_preview_thumbnail_is_served_privately_and_never_cached_publicly(
    api_client_superuser: AsyncClient, owned_camera: Camera
) -> None:
    """A recent frame must not be cacheable by a shared proxy or sniffed into another type.

    The frame is served off the private preview directory rather than the public
    ``/uploads/images`` mount precisely so a camera id alone does not hand a
    stranger a picture of someone's bench; the headers are the rest of that.
    """
    path = get_preview_thumbnail_path(owned_camera.id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\xff\xd8\xff\xd9")

    response = await api_client_superuser.get(f"/v1/plugins/rpi-cam/cameras/{owned_camera.id}/preview-thumbnail")

    assert response.status_code == status.HTTP_200_OK
    assert response.headers["cache-control"] == "private, no-cache"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["content-type"] == "image/jpeg"


async def test_preview_thumbnail_is_404_when_no_frame_has_been_cached(
    api_client_superuser: AsyncClient, owned_camera: Camera
) -> None:
    """A camera that has never streamed has no frame to serve."""
    response = await api_client_superuser.get(f"/v1/plugins/rpi-cam/cameras/{owned_camera.id}/preview-thumbnail")

    assert response.status_code == status.HTTP_404_NOT_FOUND


async def test_preview_thumbnail_is_not_served_to_a_different_user(
    api_client_user: AsyncClient, owned_camera: Camera
) -> None:
    """Another signed-in user must not read a frame from a camera they do not own."""
    path = get_preview_thumbnail_path(owned_camera.id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\xff\xd8\xff\xd9")

    response = await api_client_user.get(f"/v1/plugins/rpi-cam/cameras/{owned_camera.id}/preview-thumbnail")

    assert response.status_code == status.HTTP_404_NOT_FOUND
