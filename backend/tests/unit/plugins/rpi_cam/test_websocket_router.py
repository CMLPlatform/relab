"""Unit tests for the RPi camera WebSocket router."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.api.plugins.rpi_cam.websocket.router import (
    _authenticate,
    _handle_text_frame,
    _heartbeat_loop,
    _record_auth_failure,
)


async def test_record_auth_failure_sanitizes_ip_in_log() -> None:
    """Auth failure logging should neutralize line breaks in client IPs."""
    ip = "203.0.113.10\nFORGED"

    with patch("app.api.plugins.rpi_cam.websocket.router.logger") as mock_logger:
        _record_auth_failure(ip, 1, 0.0)

    mock_logger.warning.assert_called_once_with(
        "Auth failure from %s (%d/%d before lockout).",
        "203.0.113.10 FORGED",
        2,
        5,
    )


async def test_handle_text_frame_sanitizes_camera_id_in_log() -> None:
    """Invalid JSON logging should neutralize line breaks in camera IDs."""
    camera_id = uuid4()
    manager = MagicMock(spec=[])

    with patch("app.api.plugins.rpi_cam.websocket.router.logger") as mock_logger:
        result = await _handle_text_frame(
            raw={"text": "{not-json"},
            camera_id=camera_id,
            manager=manager,
            pending_id=None,
            pending_json=None,
            last_pong_at=[0.0],
        )

    assert result == (None, None)
    mock_logger.warning.assert_called_once_with("Camera %s sent invalid JSON, ignoring.", str(camera_id))


async def test_authenticate_sanitizes_client_ip_when_blocked() -> None:
    """Blocked auth logging should neutralize line breaks in the client IP."""
    websocket = MagicMock()
    websocket.headers = {}
    websocket.client = SimpleNamespace(host="203.0.113.10\nFORGED")
    websocket.close = AsyncMock()
    camera_id = uuid4()

    with (
        patch.dict(_authenticate.__globals__, {"_auth_failures": {"203.0.113.10\nFORGED": (5, 0.0)}}),
        patch("app.api.plugins.rpi_cam.websocket.router.asyncio.get_running_loop") as mock_loop,
        patch("app.api.plugins.rpi_cam.websocket.router.logger") as mock_logger,
    ):
        mock_loop.return_value.time.return_value = 10.0
        result = await _authenticate(websocket, camera_id)

    assert result is False
    websocket.close.assert_awaited_once()
    mock_logger.warning.assert_called_once_with(
        "Auth from %s blocked — too many failures.",
        "203.0.113.10 FORGED",
    )


async def test_heartbeat_loop_sanitizes_camera_id_on_timeout() -> None:
    """Heartbeat timeout logging should neutralize line breaks in camera IDs."""
    websocket = MagicMock()
    websocket.close = AsyncMock()
    websocket.send_text = AsyncMock()
    camera_id = uuid4()
    last_pong_at = [0.0]

    with (
        patch("app.api.plugins.rpi_cam.websocket.router.asyncio.sleep", new=AsyncMock()),
        patch("app.api.plugins.rpi_cam.websocket.router.asyncio.get_running_loop") as mock_loop,
        patch("app.api.plugins.rpi_cam.websocket.router.logger") as mock_logger,
    ):
        mock_loop.return_value.time.return_value = 91.0
        await _heartbeat_loop(websocket, camera_id, last_pong_at)

    websocket.close.assert_awaited_once_with(code=1001)
    mock_logger.warning.assert_called_once_with(
        "Camera %s heartbeat timeout (%.0fs since last pong); closing.",
        str(camera_id),
        91.0,
    )
