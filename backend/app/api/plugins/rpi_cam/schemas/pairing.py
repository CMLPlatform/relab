"""Pydantic models for the RPi camera pairing flow."""

from __future__ import annotations

from pydantic import BaseModel, Field
from relab_rpi_cam_models import PairingCode, PairingPollResponse, PairingRegisterRequest, PairingRegisterResponse

from app.api.common.validation import MultilineUserText, SingleLineUserText


class PairingClaimRequest(BaseModel):
    """User -> backend: claim a pairing code and create a camera."""

    code: PairingCode = Field(description="Pairing code displayed on the RPi's setup page.")
    camera_name: SingleLineUserText = Field(min_length=2, max_length=100, description="Name for the new camera.")
    description: MultilineUserText | None = Field(default=None, max_length=500)


__all__ = [
    "PairingClaimRequest",
    "PairingPollResponse",
    "PairingRegisterRequest",
    "PairingRegisterResponse",
]
