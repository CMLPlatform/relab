"""Relay camera HTTP-style commands through an active WebSocket connection."""

from __future__ import annotations

import asyncio
import logging

from fastapi import HTTPException
from pydantic import UUID4

from app.api.plugins.rpi_cam.websocket.connection_manager import (
    BINARY_COMMAND_TIMEOUT,
    DEFAULT_COMMAND_TIMEOUT,
    get_connection_manager,
)
from app.api.plugins.rpi_cam.websocket.protocol import RelayResponse

logger = logging.getLogger(__name__)
_RELAY_RETRY_AFTER_SECONDS = "2"
_GET = "GET"
_ALLOWED_IMAGE_PATH_PREFIX = "/images/"
_ALLOWED_COMMANDS = {
    ("GET", "/camera"),
    ("GET", "/images/preview"),
    ("POST", "/images"),
    ("GET", "/stream"),
    ("POST", "/stream"),
    ("DELETE", "/stream"),
}


def _relay_command_allowed(method: str, path: str) -> bool:
    if (method, path) in _ALLOWED_COMMANDS:
        return True
    return method == _GET and path.startswith(_ALLOWED_IMAGE_PATH_PREFIX)


async def relay_via_websocket(
    camera_id: UUID4,
    method: str,
    path: str,
    params: dict | None = None,
    body: dict | None = None,
    *,
    error_msg: str | None = None,
    expect_binary: bool = False,
) -> RelayResponse:
    """Send an allowlisted command to a camera over its WebSocket connection."""
    normalized_method = method.upper()
    if not _relay_command_allowed(normalized_method, path):
        raise HTTPException(status_code=403, detail=f"Relay command is not allowed: {normalized_method} {path}")

    manager = get_connection_manager()
    timeout = BINARY_COMMAND_TIMEOUT if expect_binary else DEFAULT_COMMAND_TIMEOUT

    try:
        async with asyncio.timeout(timeout):
            json_resp, binary = await manager.send_command(camera_id, normalized_method, path, params=params, body=body)
    except RuntimeError as exc:
        logger.warning("Camera %s not connected for relay: %s", camera_id, exc)
        raise HTTPException(
            status_code=503,
            detail="Camera is not connected via WebSocket.",
            headers={"Retry-After": _RELAY_RETRY_AFTER_SECONDS},
        ) from exc
    except TimeoutError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Camera did not respond in time: {path}",
            headers={"Retry-After": _RELAY_RETRY_AFTER_SECONDS},
        ) from exc

    response_status = json_resp.get("status", 500)
    response_data = json_resp.get("data")

    if response_status >= 400:
        _detail = error_msg or f"Camera returned error for {normalized_method} {path}"
        raise HTTPException(status_code=response_status, detail={"main API": _detail, "Camera API": response_data})

    if binary is not None:
        return RelayResponse(status_code=response_status, _content=binary)

    return RelayResponse(status_code=response_status, _json_data=response_data)
