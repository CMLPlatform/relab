"""Unit tests for camera interaction utilities."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.plugins.rpi_cam.models import Camera, CameraConnectionStatus, CameraCredentialStatus, CameraStatus
from app.api.plugins.rpi_cam.routers.camera_interaction.utils import (
    HttpMethod,
    fetch_from_camera_url,
    get_user_owned_camera,
)


def build_camera() -> Camera:
    """Build a minimal WebSocket-relayed camera for testing."""
    return Camera(
        id=uuid4(),
        name="Test Camera",
        relay_public_key_jwk={"kty": "EC", "crv": "P-256", "x": "x", "y": "y"},
        relay_key_id="test-key-id",
        relay_credential_status=CameraCredentialStatus.ACTIVE,
        owner_id=uuid4(),
    )


@pytest.mark.asyncio
async def test_fetch_from_camera_url_delegates_to_relay(monkeypatch: pytest.MonkeyPatch) -> None:
    """fetch_from_camera_url should delegate entirely to relay_via_websocket."""
    camera = build_camera()
    mock_relay = AsyncMock(return_value=AsyncMock(status_code=200))
    monkeypatch.setattr(
        "app.api.plugins.rpi_cam.routers.camera_interaction.utils.relay_via_websocket",
        mock_relay,
    )

    await fetch_from_camera_url(camera, endpoint="/camera", method=HttpMethod.GET)

    mock_relay.assert_awaited_once_with(
        camera.id,
        "GET",
        "/camera",
        body=None,
        error_msg=None,
        expect_binary=False,
    )


@pytest.mark.asyncio
async def test_fetch_from_camera_url_passes_body_and_flags(monkeypatch: pytest.MonkeyPatch) -> None:
    """fetch_from_camera_url should forward body, error_msg, and expect_binary."""
    camera = build_camera()
    mock_relay = AsyncMock(return_value=AsyncMock(status_code=200))
    monkeypatch.setattr(
        "app.api.plugins.rpi_cam.routers.camera_interaction.utils.relay_via_websocket",
        mock_relay,
    )

    await fetch_from_camera_url(
        camera,
        endpoint="/images",
        method=HttpMethod.POST,
        error_msg="Failed",
        body={"key": "val"},
        expect_binary=True,
    )

    mock_relay.assert_awaited_once_with(
        camera.id,
        "POST",
        "/images",
        body={"key": "val"},
        error_msg="Failed",
        expect_binary=True,
    )


@pytest.mark.asyncio
async def test_get_user_owned_camera_returns_camera_when_online() -> None:
    """Should return the camera when it is online."""
    camera = build_camera()
    session = AsyncMock()
    user_id = uuid4()

    with patch(
        "app.api.plugins.rpi_cam.routers.camera_interaction.utils.get_user_owned_object",
        new=AsyncMock(return_value=camera),
    ):
        camera.get_status = AsyncMock(return_value=CameraStatus(connection=CameraConnectionStatus.ONLINE))

        result = await get_user_owned_camera(session, camera.id, user_id)

    assert result is camera
    camera.get_status.assert_awaited_once_with(force_refresh=True)


@pytest.mark.asyncio
async def test_get_user_owned_camera_raises_503_when_offline() -> None:
    """Should raise HTTP 503 when the camera is offline."""
    camera = build_camera()
    session = AsyncMock()
    user_id = uuid4()

    with patch(
        "app.api.plugins.rpi_cam.routers.camera_interaction.utils.get_user_owned_object",
        new=AsyncMock(return_value=camera),
    ):
        camera.get_status = AsyncMock(return_value=CameraStatus(connection=CameraConnectionStatus.OFFLINE))

        with pytest.raises(HTTPException) as exc_info:
            await get_user_owned_camera(session, camera.id, user_id)

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "Camera is offline"
    camera.get_status.assert_awaited_once_with(force_refresh=True)


@pytest.mark.asyncio
async def test_get_user_owned_camera_raises_401_when_unauthorized() -> None:
    """Should raise HTTP 401 when the camera returns unauthorized status."""
    camera = build_camera()
    session = AsyncMock()
    user_id = uuid4()

    with patch(
        "app.api.plugins.rpi_cam.routers.camera_interaction.utils.get_user_owned_object",
        new=AsyncMock(return_value=camera),
    ):
        camera.get_status = AsyncMock(return_value=CameraStatus(connection=CameraConnectionStatus.UNAUTHORIZED))

        with pytest.raises(HTTPException) as exc_info:
            await get_user_owned_camera(session, camera.id, user_id)

    assert exc_info.value.status_code == 401
