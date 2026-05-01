"""Unit tests for WebSocket relay transport helpers."""
# spell-checker: ignore whep
# ruff: noqa: SLF001 # Private member behaviour is tested here, so we want to allow it.

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.plugins.rpi_cam.websocket import cross_worker_circuit_breaker as circuit_breaker
from app.api.plugins.rpi_cam.websocket import relay as relay_mod


async def test_relay_via_websocket_returns_retry_after_when_camera_is_disconnected() -> None:
    """Relay disconnects should surface as temporary failures with Retry-After."""
    camera_id = uuid4()
    manager = AsyncMock()
    manager.send_command.side_effect = RuntimeError("camera disconnected")

    with (
        patch("app.api.plugins.rpi_cam.websocket.relay.get_connection_manager", return_value=manager),
        pytest.raises(HTTPException) as exc_info,
    ):
        await relay_mod.relay_via_websocket(camera_id, "GET", "/camera")

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "Camera is not connected via WebSocket."
    assert exc_info.value.headers == {"Retry-After": "2"}


async def test_relay_via_websocket_forwards_trace_headers_to_local_manager() -> None:
    """The direct relay path should include the current trace headers."""
    camera_id = uuid4()
    manager = AsyncMock()
    manager.send_command.return_value = ({"status": 200, "data": {"ok": True}}, None)

    with (
        patch("app.api.plugins.rpi_cam.websocket.relay.get_connection_manager", return_value=manager),
        patch(
            "app.api.plugins.rpi_cam.websocket.relay._build_relay_trace_headers",
            return_value={"traceparent": "00-abc-def-01", "tracestate": "vendor=value"},
        ),
    ):
        response = await relay_mod.relay_via_websocket(camera_id, "GET", "/camera")

    assert response.status_code == 200
    manager.send_command.assert_awaited_once_with(
        camera_id,
        "GET",
        "/camera",
        params=None,
        body=None,
        headers={"traceparent": "00-abc-def-01", "tracestate": "vendor=value"},
    )


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
        await relay_mod.relay_via_websocket(camera_id, "GET", "/camera")

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "Camera did not respond in time: /camera"
    assert exc_info.value.headers == {"Retry-After": "2"}


async def test_relay_via_websocket_sanitizes_path_and_response_in_warning_log(caplog: pytest.LogCaptureFixture) -> None:
    """Warning logs should neutralize newline characters from relay-controlled values."""
    camera_id = uuid4()
    manager = AsyncMock()
    manager.send_command.return_value = (
        {"status": 400, "data": "bad\npayload\rvalue"},
        None,
    )

    with (
        patch("app.api.plugins.rpi_cam.websocket.relay.get_connection_manager", return_value=manager),
        pytest.raises(HTTPException),
        caplog.at_level("WARNING"),
    ):
        await relay_mod.relay_via_websocket(camera_id, "GET", "/camera")

    assert any("bad payload value" in record.message and "GET /camera" in record.message for record in caplog.records)


async def test_cross_worker_relay_opens_circuit_after_three_failures() -> None:
    """After three failed cross-worker attempts, later requests should fast-fail."""
    camera_id = uuid4()
    manager = AsyncMock()
    manager.send_command.side_effect = RuntimeError("camera disconnected")
    redis = AsyncMock()
    redis.exists = AsyncMock(return_value=0)

    circuit_breaker.reset_for_tests()

    with (
        patch("app.api.plugins.rpi_cam.websocket.relay.get_connection_manager", return_value=manager),
        patch(
            "app.api.plugins.rpi_cam.websocket.relay.relay_cross_worker",
            AsyncMock(side_effect=RuntimeError("camera offline")),
        ) as relay_cross_worker,
    ):
        for _ in range(3):
            with pytest.raises(HTTPException) as exc_info:
                await relay_mod.relay_via_websocket(camera_id, "GET", "/camera", redis=redis)
            assert exc_info.value.status_code == 503

        with pytest.raises(HTTPException) as exc_info:
            await relay_mod.relay_via_websocket(camera_id, "GET", "/camera", redis=redis)

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "Camera is not connected via WebSocket."
    assert relay_cross_worker.await_count == 3


async def test_cross_worker_relay_forwards_trace_headers() -> None:
    """The cross-worker bridge should carry trace headers through Redis."""
    camera_id = uuid4()
    manager = AsyncMock()
    manager.send_command.side_effect = RuntimeError("camera disconnected")
    redis = AsyncMock()
    redis.exists = AsyncMock(return_value=0)

    circuit_breaker.reset_for_tests()

    with (
        patch("app.api.plugins.rpi_cam.websocket.relay.get_connection_manager", return_value=manager),
        patch(
            "app.api.plugins.rpi_cam.websocket.relay._build_relay_trace_headers",
            return_value={"traceparent": "00-abc-def-01", "baggage": "user_id=42"},
        ),
        patch(
            "app.api.plugins.rpi_cam.websocket.relay.relay_cross_worker",
            AsyncMock(return_value=({"status": 200, "data": {"ok": True}}, None)),
        ) as relay_cross_worker,
    ):
        response = await relay_mod.relay_via_websocket(camera_id, "GET", "/camera", redis=redis)

    assert response.status_code == 200
    relay_cross_worker.assert_awaited_once_with(
        redis,
        camera_id,
        "GET",
        "/camera",
        None,
        None,
        {"traceparent": "00-abc-def-01", "baggage": "user_id=42"},
        timeout_s=relay_mod.DEFAULT_COMMAND_TIMEOUT,
    )


async def test_cross_worker_relay_success_resets_circuit() -> None:
    """A successful cross-worker call should clear prior failure state."""
    camera_id = uuid4()
    manager = AsyncMock()
    manager.send_command.side_effect = RuntimeError("camera disconnected")
    redis = AsyncMock()
    redis.exists = AsyncMock(return_value=0)

    circuit_breaker.reset_for_tests()

    with (
        patch("app.api.plugins.rpi_cam.websocket.relay.get_connection_manager", return_value=manager),
        patch(
            "app.api.plugins.rpi_cam.websocket.relay.relay_cross_worker",
            AsyncMock(
                side_effect=[
                    RuntimeError("camera offline"),
                    RuntimeError("camera offline"),
                    ({"status": 200, "data": {"ok": True}}, None),
                    RuntimeError("camera offline"),
                ]
            ),
        ) as relay_cross_worker,
    ):
        for _ in range(2):
            with pytest.raises(HTTPException):
                await relay_mod.relay_via_websocket(camera_id, "GET", "/camera", redis=redis)

        response = await relay_mod.relay_via_websocket(camera_id, "GET", "/camera", redis=redis)
        assert response.status_code == 200

        with pytest.raises(HTTPException) as exc_info:
            await relay_mod.relay_via_websocket(camera_id, "GET", "/camera", redis=redis)

    assert exc_info.value.status_code == 503
    assert relay_cross_worker.await_count == 4


async def test_cross_worker_relay_half_opens_after_cooldown() -> None:
    """Once cooldown expires, the next call should probe the camera again."""
    camera_id = uuid4()
    manager = AsyncMock()
    manager.send_command.side_effect = RuntimeError("camera disconnected")
    redis = AsyncMock()
    redis.exists = AsyncMock(return_value=0)

    circuit_breaker.reset_for_tests()
    circuit_breaker._cross_worker_cb_state[camera_id] = (
        circuit_breaker.FAILURE_THRESHOLD,
        0.0,
    )

    with (
        patch("app.api.plugins.rpi_cam.websocket.relay.get_connection_manager", return_value=manager),
        patch(
            "app.api.plugins.rpi_cam.websocket.relay.relay_cross_worker",
            AsyncMock(side_effect=RuntimeError("camera still offline")),
        ) as relay_cross_worker,
        pytest.raises(HTTPException),
    ):
        await relay_mod.relay_via_websocket(camera_id, "GET", "/camera", redis=redis)
    assert relay_cross_worker.await_count == 1


class TestRelayCommandAllowlist:
    """Tests for the relay command allowlist."""

    @pytest.mark.parametrize(
        ("method", "path"),
        [
            ("GET", "/camera"),
            ("POST", "/captures"),
            ("GET", "/streams/youtube"),
            ("POST", "/streams/youtube"),
            ("DELETE", "/streams/youtube"),
            ("GET", "/system/telemetry"),
            ("GET", "/preview/hls/cam-preview/index.m3u8"),
            ("GET", "/preview/hls/cam-preview/segment0.mp4"),
            ("DELETE", "/pairing"),
        ],
    )
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
            ("PUT", "/streams/youtube"),
            ("GET", "/v1/admin"),
            ("GET", "/captures/preview"),
            ("PATCH", "/camera"),
            ("GET", "/"),
            # The Pi pushes directly via HTTPS to the upload endpoint; any `GET /captures/{id}`
            # attempt must now be rejected.
            ("GET", "/captures/abc123"),
            ("GET", "/captures/"),
            # HLS must stay read-only and under the /preview/hls/ prefix.
            ("POST", "/preview/hls/cam-preview/index.m3u8"),
            ("DELETE", "/preview/hls/cam-preview/segment0.mp4"),
            ("GET", "/preview/hls"),  # bare /hls without trailing slash
            # Telemetry must stay read-only.
            ("POST", "/system/telemetry"),
            ("DELETE", "/system/telemetry"),
        ],
    )
    async def test_blocked_commands_raise_403(self, method: str, path: str) -> None:
        """Non-allowlisted method/path pairs should raise HTTP 403."""
        camera_id = uuid4()

        with pytest.raises(HTTPException) as exc_info:
            await relay_mod.relay_via_websocket(camera_id, method, path)

        assert exc_info.value.status_code == 403
        assert "not allowed" in exc_info.value.detail
