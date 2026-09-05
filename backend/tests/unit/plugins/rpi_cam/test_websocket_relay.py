"""Unit tests for WebSocket relay transport helpers."""

import asyncio
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from relab_rpi_cam_models import RELAY_COMMAND_FORBIDDEN_DETAIL

from app.api.plugins.rpi_cam.runtime.status import get_camera_online_cache_key
from app.api.plugins.rpi_cam.websocket import message_relay as relay_mod
from app.api.plugins.rpi_cam.websocket.connection_manager import CameraDisconnectedDuringCommandError


class _FakeRedis:
    """Dict-backed stand-in for the online-status key reads the relay makes."""

    def __init__(self) -> None:
        self.store: dict[str, str] = {}

    async def get(self, key: str) -> str | None:
        return self.store.get(key)

    def mark_online(self, camera_id: UUID) -> None:
        self.store[get_camera_online_cache_key(camera_id)] = "1"


async def test_relay_via_websocket_returns_retry_after_when_camera_is_disconnected() -> None:
    """Relay disconnects should surface as temporary failures with Retry-After."""
    camera_id = uuid4()
    manager = AsyncMock()
    manager.send_command.side_effect = RuntimeError("camera disconnected")
    redis = _FakeRedis()
    redis.mark_online(camera_id)

    with (
        patch("app.api.plugins.rpi_cam.websocket.message_relay.get_connection_manager", return_value=manager),
        patch(
            "app.api.plugins.rpi_cam.websocket.message_relay.relay_cross_worker",
            AsyncMock(side_effect=RuntimeError("camera offline in all workers")),
        ),
        pytest.raises(HTTPException) as exc_info,
    ):
        await relay_mod.relay_via_websocket(camera_id, "GET", "/camera", redis=redis)

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "Camera is not connected via WebSocket."
    assert exc_info.value.headers == {"Retry-After": "2"}


async def test_relay_via_websocket_forwards_trace_headers_to_local_manager() -> None:
    """The direct relay path should include the current trace headers."""
    camera_id = uuid4()
    manager = AsyncMock()
    manager.send_command.return_value = ({"status": 200, "data": {"ok": True}}, None)

    with (
        patch("app.api.plugins.rpi_cam.websocket.message_relay.get_connection_manager", return_value=manager),
        patch(
            "app.api.plugins.rpi_cam.websocket.message_relay._build_relay_trace_headers",
            return_value={"traceparent": "00-abc-def-01", "tracestate": "vendor=value"},
        ),
    ):
        response = await relay_mod.relay_via_websocket(camera_id, "GET", "/camera", redis=AsyncMock())

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
        patch("app.api.plugins.rpi_cam.websocket.message_relay.DEFAULT_COMMAND_TIMEOUT", 0.001),
        patch("app.api.plugins.rpi_cam.websocket.message_relay.get_connection_manager", return_value=manager),
        pytest.raises(HTTPException) as exc_info,
    ):
        await relay_mod.relay_via_websocket(camera_id, "GET", "/camera", redis=AsyncMock())

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
        patch("app.api.plugins.rpi_cam.websocket.message_relay.get_connection_manager", return_value=manager),
        pytest.raises(HTTPException),
        caplog.at_level("WARNING"),
    ):
        await relay_mod.relay_via_websocket(camera_id, "GET", "/camera", redis=AsyncMock())

    assert any("bad payload value" in record.message and "GET /camera" in record.message for record in caplog.records)


async def test_mid_command_disconnect_skips_cross_worker_bridge() -> None:
    """A disconnect mid-command must not fall through to the cross-worker bridge."""
    camera_id = uuid4()
    manager = AsyncMock()
    manager.send_command.side_effect = CameraDisconnectedDuringCommandError("camera disconnected during command")
    redis = _FakeRedis()
    redis.mark_online(camera_id)

    with (
        patch("app.api.plugins.rpi_cam.websocket.message_relay.get_connection_manager", return_value=manager),
        patch(
            "app.api.plugins.rpi_cam.websocket.message_relay.relay_cross_worker",
            AsyncMock(),
        ) as relay_cross_worker,
        pytest.raises(HTTPException) as exc_info,
    ):
        await relay_mod.relay_via_websocket(camera_id, "GET", "/camera", redis=redis)

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "Camera is not connected via WebSocket."
    relay_cross_worker.assert_not_awaited()


async def test_cross_worker_relay_fast_fails_when_camera_not_marked_online() -> None:
    """Without the heartbeat-maintained online key, the bridge is skipped entirely."""
    camera_id = uuid4()
    manager = AsyncMock()
    manager.send_command.side_effect = RuntimeError("camera disconnected")
    redis = _FakeRedis()

    with (
        patch("app.api.plugins.rpi_cam.websocket.message_relay.get_connection_manager", return_value=manager),
        patch(
            "app.api.plugins.rpi_cam.websocket.message_relay.relay_cross_worker",
            AsyncMock(),
        ) as relay_cross_worker,
        pytest.raises(HTTPException) as exc_info,
    ):
        await relay_mod.relay_via_websocket(camera_id, "GET", "/camera", redis=redis)

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "Camera is not connected via WebSocket."
    relay_cross_worker.assert_not_awaited()


async def test_cross_worker_allowlist_rejection_surfaces_as_403() -> None:
    """A ``RelayCommandRejectedError`` from the owning worker must surface as 403, not 503."""
    camera_id = uuid4()
    manager = AsyncMock()
    manager.send_command.side_effect = RuntimeError("camera disconnected")
    redis = _FakeRedis()
    redis.mark_online(camera_id)

    with (
        patch("app.api.plugins.rpi_cam.websocket.message_relay.get_connection_manager", return_value=manager),
        patch(
            "app.api.plugins.rpi_cam.websocket.message_relay.relay_cross_worker",
            AsyncMock(
                side_effect=relay_mod.RelayCommandRejectedError(403, RELAY_COMMAND_FORBIDDEN_DETAIL),
            ),
        ),
        pytest.raises(HTTPException) as exc_info,
    ):
        await relay_mod.relay_via_websocket(camera_id, "GET", "/camera", redis=redis)

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == RELAY_COMMAND_FORBIDDEN_DETAIL


async def test_cross_worker_generic_error_still_surfaces_as_503() -> None:
    """A generic cross-worker RuntimeError (not an explicit 4xx) keeps the 503 behavior."""
    camera_id = uuid4()
    manager = AsyncMock()
    manager.send_command.side_effect = RuntimeError("camera disconnected")
    redis = _FakeRedis()
    redis.mark_online(camera_id)

    with (
        patch("app.api.plugins.rpi_cam.websocket.message_relay.get_connection_manager", return_value=manager),
        patch(
            "app.api.plugins.rpi_cam.websocket.message_relay.relay_cross_worker",
            AsyncMock(side_effect=RuntimeError("camera offline in all workers")),
        ),
        pytest.raises(HTTPException) as exc_info,
    ):
        await relay_mod.relay_via_websocket(camera_id, "GET", "/camera", redis=redis)

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "Camera is not connected via WebSocket."


async def test_cross_worker_relay_forwards_trace_headers() -> None:
    """The cross-worker bridge should carry trace headers through Redis."""
    camera_id = uuid4()
    manager = AsyncMock()
    manager.send_command.side_effect = RuntimeError("camera disconnected")
    redis = _FakeRedis()
    redis.mark_online(camera_id)

    with (
        patch("app.api.plugins.rpi_cam.websocket.message_relay.get_connection_manager", return_value=manager),
        patch(
            "app.api.plugins.rpi_cam.websocket.message_relay._build_relay_trace_headers",
            return_value={"traceparent": "00-abc-def-01", "baggage": "user_id=42"},
        ),
        patch(
            "app.api.plugins.rpi_cam.websocket.message_relay.relay_cross_worker",
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


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/camera"),
        ("GET", "/preview/hls/cam-preview/index.m3u8"),
    ],
)
async def test_allowed_commands_are_dispatched(method: str, path: str) -> None:
    """Allowlisted method/path pairs should be dispatched to the manager."""
    camera_id = uuid4()
    manager = AsyncMock()
    manager.send_command = AsyncMock(return_value=({"status": 200, "data": {}}, None))

    with patch("app.api.plugins.rpi_cam.websocket.message_relay.get_connection_manager", return_value=manager):
        response = await relay_mod.relay_via_websocket(camera_id, method, path, redis=AsyncMock())

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
async def test_blocked_commands_raise_403(method: str, path: str) -> None:
    """Non-allowlisted method/path pairs should raise HTTP 403."""
    camera_id = uuid4()

    with pytest.raises(HTTPException) as exc_info:
        await relay_mod.relay_via_websocket(camera_id, method, path, redis=AsyncMock())

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == RELAY_COMMAND_FORBIDDEN_DETAIL
