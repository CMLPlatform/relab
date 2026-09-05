"""Unit tests for camera interaction utilities."""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.plugins.rpi_cam.models import Camera, CameraConnectionStatus, CameraStatus
from app.api.plugins.rpi_cam.runtime.relay import get_user_owned_camera


async def test_get_user_owned_camera_returns_camera_when_online(mock_camera: Camera) -> None:
    """Should return the camera when it is online."""
    camera = mock_camera
    session = AsyncMock()
    user_id = uuid4()
    redis = AsyncMock()
    get_status_mock = AsyncMock(return_value=CameraStatus(connection=CameraConnectionStatus.ONLINE))

    with (
        patch(
            "app.api.plugins.rpi_cam.runtime.relay.get_user_owned_object",
            new=AsyncMock(return_value=camera),
        ),
        patch(
            "app.api.plugins.rpi_cam.runtime.relay.get_camera_status",
            new=get_status_mock,
        ),
    ):
        result = await get_user_owned_camera(session, camera.id, user_id, redis)

    assert result is camera
    get_status_mock.assert_awaited_once_with(redis, camera.id)


async def test_get_user_owned_camera_raises_503_when_offline(mock_camera: Camera) -> None:
    """Should raise HTTP 503 when the camera is offline."""
    camera = mock_camera
    session = AsyncMock()
    user_id = uuid4()
    redis = AsyncMock()
    get_status_mock = AsyncMock(return_value=CameraStatus(connection=CameraConnectionStatus.OFFLINE))

    with (
        patch(
            "app.api.plugins.rpi_cam.runtime.relay.get_user_owned_object",
            new=AsyncMock(return_value=camera),
        ),
        patch(
            "app.api.plugins.rpi_cam.runtime.relay.get_camera_status",
            new=get_status_mock,
        ),
        pytest.raises(HTTPException) as exc_info,
    ):
        await get_user_owned_camera(session, camera.id, user_id, redis)

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "Camera is offline"
    get_status_mock.assert_awaited_once_with(redis, camera.id)


async def test_get_user_owned_camera_raises_401_when_unauthorized(mock_camera: Camera) -> None:
    """Should raise HTTP 401 when the camera returns unauthorized status."""
    camera = mock_camera
    session = AsyncMock()
    user_id = uuid4()
    redis = AsyncMock()
    get_status_mock = AsyncMock(return_value=CameraStatus(connection=CameraConnectionStatus.UNAUTHORIZED))

    with (
        patch(
            "app.api.plugins.rpi_cam.runtime.relay.get_user_owned_object",
            new=AsyncMock(return_value=camera),
        ),
        patch(
            "app.api.plugins.rpi_cam.runtime.relay.get_camera_status",
            new=get_status_mock,
        ),
        pytest.raises(HTTPException) as exc_info,
    ):
        await get_user_owned_camera(session, camera.id, user_id, redis)

    assert exc_info.value.status_code == 401
