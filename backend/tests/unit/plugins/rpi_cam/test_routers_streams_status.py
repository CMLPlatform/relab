"""Unit tests for read/status RPi Cam stream router behavior."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch

from httpx import Response

from app.api.plugins.rpi_cam.constants import PLUGIN_STREAM_ENDPOINT
from app.api.plugins.rpi_cam.routers.camera_interaction.streams import get_camera_stream_status
from tests.unit.plugins.rpi_cam.stream_router_test_support import (
    HTTP_OK,
    TEST_STREAM_URL,
    build_user,
    require_uuid,
)

if TYPE_CHECKING:
    from app.api.plugins.rpi_cam.models import Camera


@patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.get_user_owned_camera")
@patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.build_camera_request")
async def test_get_camera_stream_status_success(
    mock_build_camera_request: MagicMock, mock_get_cam: MagicMock, mock_camera: Camera
) -> None:
    """Retrieving the current streaming status should proxy the camera response."""
    mock_get_cam.return_value = mock_camera
    session_mock = AsyncMock()
    user_mock = build_user()
    camera_id = require_uuid(mock_camera.id)

    mock_camera_request = AsyncMock(
        return_value=Response(
            HTTP_OK,
            json={
                "url": TEST_STREAM_URL,
                "mode": "youtube",
                "provider": "youtube",
                "started_at": "2026-02-26T10:00:00Z",
                "metadata": {"camera_properties": {}, "capture_metadata": {}},
            },
        )
    )
    mock_build_camera_request.return_value = mock_camera_request

    result = await get_camera_stream_status(camera_id, session_mock, user_mock, AsyncMock())

    assert str(result.url) == f"{TEST_STREAM_URL}/"
    mock_camera_request.assert_awaited_once()
    await_args = mock_camera_request.await_args
    assert await_args is not None
    assert await_args.kwargs["endpoint"] == PLUGIN_STREAM_ENDPOINT
