"""Unit tests for RPi Cam router dependencies and schemas."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.schemas import CameraUpdate


def build_camera(*, owner_id: uuid.UUID) -> Camera:
    """Build a camera instance for dependency tests."""
    return Camera(
        name="Camera",
        owner_id=owner_id,
        relay_public_key_jwk={"kty": "EC", "crv": "P-256", "x": "x", "y": "y"},
        relay_key_id="test-key-id",
    )


async def test_camera_update_accepts_regular_updates_without_owner_transfer() -> None:
    """Regular camera updates remain valid without ownership transfer support."""
    session = AsyncMock()
    camera = build_camera(owner_id=uuid.uuid4())
    camera_in = CameraUpdate(name="Updated")

    assert camera.owner_id is not None
    assert camera_in.name == "Updated"
    session.add.assert_not_called()


def test_camera_update_rejects_public_owner_transfer() -> None:
    """Public camera updates must not accept owner_id transfer payloads."""
    with pytest.raises(ValidationError, match="owner_id"):
        CameraUpdate.model_validate({"owner_id": str(uuid.uuid4())})
