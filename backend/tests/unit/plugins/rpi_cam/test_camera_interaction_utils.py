"""Unit tests for camera interaction utilities."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from httpx import AsyncClient, MockTransport, Request, Response

from app.api.plugins.rpi_cam.models import Camera, CameraConnectionStatus, CameraStatus, ConnectionMode
from app.api.plugins.rpi_cam.routers.camera_interaction.utils import (
    HttpMethod,
    fetch_from_camera_url,
    get_user_owned_camera,
)
from app.api.plugins.rpi_cam.utils.encryption import encrypt_str


def build_camera() -> Camera:
    """Build a camera configured for HTTP transport tests."""
    return Camera(
        id=uuid4(),
        name="Test Camera",
        url="http://example.com",
        encrypted_api_key=encrypt_str("secret"),
        owner_id=uuid4(),
    )


def build_websocket_camera() -> Camera:
    """Build a camera configured for WebSocket transport tests."""
    return Camera(
        id=uuid4(),
        name="WebSocket Camera",
        connection_mode=ConnectionMode.WEBSOCKET,
        encrypted_api_key=encrypt_str("secret"),
        owner_id=uuid4(),
    )


def build_transport(response: Response, request_log: list[Request]) -> MockTransport:
    """Build a mock transport that records outgoing requests."""

    def handler(request: Request) -> Response:
        request_log.append(request)
        return response

    return MockTransport(handler)


@pytest.mark.asyncio
async def test_fetch_from_camera_url_uses_http_transport() -> None:
    """HTTP camera URLs should use the shared HTTP client."""
    request_log: list[Request] = []
    async with AsyncClient(transport=build_transport(Response(200, json={"ok": True}), request_log)) as client:
        camera = build_camera()

        response = await fetch_from_camera_url(
            camera,
            endpoint="/camera",
            method=HttpMethod.GET,
            http_client=client,
        )

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert len(request_log) == 1
    assert str(request_log[0].url) == "http://example.com/camera"
    assert request_log[0].headers["x-api-key"] == "secret"


@pytest.mark.asyncio
async def test_fetch_from_camera_url_handles_non_json_error_body() -> None:
    """Non-JSON camera errors should still produce a clean HTTPException."""
    request_log: list[Request] = []
    response = Response(502, text="camera upstream failed")

    async with AsyncClient(transport=build_transport(response, request_log)) as client:
        camera = build_camera()

        with pytest.raises(HTTPException) as exc_info:
            await fetch_from_camera_url(
                camera,
                endpoint="/camera",
                method=HttpMethod.GET,
                http_client=client,
            )

    assert exc_info.value.status_code == 502
    detail = exc_info.value.detail
    assert isinstance(detail, dict)
    assert detail["Camera API"] == "camera upstream failed"


@pytest.mark.asyncio
async def test_get_user_owned_camera_forces_live_status_for_websocket_cameras() -> None:
    """WebSocket camera actions should bypass cached status during relay reconnect windows."""
    camera = build_websocket_camera()
    session = AsyncMock()
    http_client = AsyncMock()
    user_id = uuid4()

    with patch(
        "app.api.plugins.rpi_cam.routers.camera_interaction.utils.get_user_owned_object",
        new=AsyncMock(return_value=camera),
    ):
        camera.get_status = AsyncMock(return_value=CameraStatus(connection=CameraConnectionStatus.ONLINE))

        result = await get_user_owned_camera(session, camera.id, user_id, http_client)

    assert result is camera
    camera.get_status.assert_awaited_once_with(http_client, force_refresh=True)


@pytest.mark.asyncio
async def test_get_user_owned_camera_uses_cached_status_for_http_cameras() -> None:
    """HTTP camera actions should keep the cheaper cached status lookup."""
    camera = build_camera()
    session = AsyncMock()
    http_client = AsyncMock()
    user_id = uuid4()

    with patch(
        "app.api.plugins.rpi_cam.routers.camera_interaction.utils.get_user_owned_object",
        new=AsyncMock(return_value=camera),
    ):
        camera.get_status = AsyncMock(return_value=CameraStatus(connection=CameraConnectionStatus.ONLINE))

        result = await get_user_owned_camera(session, camera.id, user_id, http_client)

    assert result is camera
    camera.get_status.assert_awaited_once_with(http_client, force_refresh=False)


@pytest.mark.asyncio
async def test_get_user_owned_camera_raises_when_live_websocket_status_is_offline() -> None:
    """WebSocket actions should fail early when the live relay status is offline."""
    camera = build_websocket_camera()
    session = AsyncMock()
    http_client = AsyncMock()
    user_id = uuid4()

    with patch(
        "app.api.plugins.rpi_cam.routers.camera_interaction.utils.get_user_owned_object",
        new=AsyncMock(return_value=camera),
    ):
        camera.get_status = AsyncMock(return_value=CameraStatus(connection=CameraConnectionStatus.OFFLINE))

        with pytest.raises(HTTPException) as exc_info:
            await get_user_owned_camera(session, camera.id, user_id, http_client)

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "Camera is offline"
    camera.get_status.assert_awaited_once_with(http_client, force_refresh=True)
