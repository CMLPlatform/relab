"""Unit tests for WebSocket relay transport helpers."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.plugins.rpi_cam.websocket import relay as relay_mod


@pytest.mark.asyncio
async def test_relay_via_websocket_returns_retry_after_when_camera_is_disconnected() -> None:
    """Relay disconnects should surface as temporary failures with Retry-After."""
    camera_id = uuid4()
    manager = AsyncMock()
    manager.send_command.side_effect = RuntimeError("camera disconnected")

    with (
        patch("app.api.plugins.rpi_cam.websocket.relay.get_connection_manager", return_value=manager),
        pytest.raises(HTTPException) as exc_info,
    ):
        await relay_mod.relay_via_websocket(camera_id, "GET", "/images/preview")

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "Camera is not connected via WebSocket."
    assert exc_info.value.headers == {"Retry-After": "2"}


@pytest.mark.asyncio
async def test_relay_via_websocket_returns_retry_after_when_camera_times_out() -> None:
    """Relay timeouts should also hint that a retry is appropriate."""
    camera_id = uuid4()
    manager = AsyncMock()

    async def _never_returns(*_args: object, **_kwargs: object) -> tuple[dict, bytes | None]:
        await asyncio.sleep(0)
        raise TimeoutError

    manager.send_command.side_effect = _never_returns

    with (
        patch("app.api.plugins.rpi_cam.websocket.relay.DEFAULT_COMMAND_TIMEOUT", 0.001),
        patch("app.api.plugins.rpi_cam.websocket.relay.get_connection_manager", return_value=manager),
        pytest.raises(HTTPException) as exc_info,
    ):
        await relay_mod.relay_via_websocket(camera_id, "GET", "/images/preview")

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "Camera did not respond in time: /images/preview"
    assert exc_info.value.headers == {"Retry-After": "2"}


class TestRelayCommandAllowlist:
    """Tests for the relay command allowlist."""

    @pytest.mark.parametrize(
        ("method", "path"),
        [
            ("GET", "/camera"),
            ("GET", "/images/preview"),
            ("POST", "/images"),
            ("GET", "/stream"),
            ("POST", "/stream"),
            ("DELETE", "/stream"),
            ("GET", "/images/abc123"),  # dynamic image path prefix
        ],
    )
    @pytest.mark.asyncio
    async def test_allowed_commands_are_dispatched(self, method: str, path: str) -> None:
        """Allowlisted method/path pairs should be dispatched to the manager."""
        camera_id = uuid4()
        manager = AsyncMock()
        manager.send_command = AsyncMock(return_value=({"status": 200, "data": {}}, None))

        with patch("app.api.plugins.rpi_cam.websocket.relay.get_connection_manager", return_value=manager):
            response = await relay_mod.relay_via_websocket(camera_id, method, path)

        assert response.status_code == 200

    @pytest.mark.parametrize(
        ("method", "path"),
        [
            ("DELETE", "/camera"),
            ("PUT", "/stream"),
            ("GET", "/admin"),
            ("POST", "/images/preview"),
            ("PATCH", "/camera"),
            ("GET", "/"),
        ],
    )
    @pytest.mark.asyncio
    async def test_blocked_commands_raise_403(self, method: str, path: str) -> None:
        """Non-allowlisted method/path pairs should raise HTTP 403."""
        camera_id = uuid4()

        with pytest.raises(HTTPException) as exc_info:
            await relay_mod.relay_via_websocket(camera_id, method, path)

        assert exc_info.value.status_code == 403
        assert "not allowed" in exc_info.value.detail
