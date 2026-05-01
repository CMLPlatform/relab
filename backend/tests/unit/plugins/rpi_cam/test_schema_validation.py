"""Validation tests for Raspberry Pi camera API schemas."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.api.plugins.rpi_cam.schemas import CameraUpdate
from app.api.plugins.rpi_cam.schemas.pairing import PairingClaimRequest


def test_pairing_claim_normalizes_camera_name_to_nfc() -> None:
    """Pairing text fields are normalized before persistence."""
    claim = PairingClaimRequest(code="ABCD12", camera_name="Cafe\u0301 camera")

    assert claim.camera_name == "Café camera"


def test_camera_update_rejects_hidden_control_characters() -> None:
    """Camera text fields reject invisible control bytes."""
    with pytest.raises(ValidationError):
        CameraUpdate.model_validate({"description": "kitchen\u0000camera"})
