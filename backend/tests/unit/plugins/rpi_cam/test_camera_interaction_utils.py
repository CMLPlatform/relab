"""Unit tests for camera interaction utilities."""

from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi import HTTPException
from httpx import AsyncClient, MockTransport, Request, Response
from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.routers.camera_interaction.utils import (
    HttpMethod,
    fetch_from_camera_url,
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
            endpoint="/camera/status",
            method=HttpMethod.GET,
            http_client=client,
        )

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert len(request_log) == 1
    assert str(request_log[0].url) == "http://example.com/camera/status"
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
                endpoint="/camera/status",
                method=HttpMethod.GET,
                http_client=client,
            )

    assert exc_info.value.status_code == 502
    detail = exc_info.value.detail
    assert isinstance(detail, dict)
    assert detail["Camera API"] == "camera upstream failed"


