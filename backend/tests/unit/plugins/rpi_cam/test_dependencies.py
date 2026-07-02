"""Unit tests for RPi Cam router dependencies and schemas."""

import uuid

import pytest
from pydantic import ValidationError

from app.api.plugins.rpi_cam.schemas import CameraUpdate


def test_camera_update_rejects_public_owner_transfer() -> None:
    """Public camera updates must not accept owner_id transfer payloads."""
    with pytest.raises(ValidationError, match="owner_id"):
        CameraUpdate.model_validate({"owner_id": str(uuid.uuid4())})
