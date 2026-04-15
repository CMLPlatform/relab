"""Relay camera HTTP-style commands through an active WebSocket connection."""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from fastapi import HTTPException
from pydantic import UUID4

from app.api.plugins.rpi_cam.websocket.connection_manager import (
    BINARY_COMMAND_TIMEOUT,
    DEFAULT_COMMAND_TIMEOUT,
    get_connection_manager,
)
from app.api.plugins.rpi_cam.websocket.cross_worker_relay import relay_cross_worker
from app.api.plugins.rpi_cam.websocket.protocol import RelayResponse

if TYPE_CHECKING:
    from redis.asyncio import Redis

logger = logging.getLogger(__name__)
_RELAY_RETRY_AFTER_SECONDS = "2"

# Exact (method, path) pairs permitted through the relay. Anything outside this
# set and _ALLOWED_PATH_PREFIXES is rejected with 403.
#
# The relay carries commands only: captured image bytes travel over a direct
# Pi→backend HTTPS upload (see
# ``routers/camera_interaction/images.py::receive_camera_upload``), not
# through this allowlist.
_ALLOWED_COMMANDS = {
    ("GET", "/camera"),
    ("POST", "/images"),
    ("GET", "/stream"),
    ("POST", "/stream"),
    ("DELETE", "/stream"),
    ("GET", "/telemetry"),
    # Sent by the backend when a camera is deleted so the Pi clears its
    # credentials and re-enters pairing mode automatically.
    ("DELETE", "/pairing/credentials"),
}

# Dynamic prefixes. Requests where `path.startswith(prefix)` are permitted for
# the matching method. Prefix entries must end in `/` to avoid accidental
# prefix-of-sibling matches.
_ALLOWED_PATH_PREFIXES: tuple[tuple[str, str], ...] = (
    # LL-HLS live preview. The Pi proxies to its local MediaMTX HLS listener
    # on :8888 and returns playlist + segment bytes. Every segment fetch is
    # one relay round-trip — at ~500kbps lores / 200ms parts that's ~12.5 KB
    # per request, which the WebSocket carries fine.
    ("GET", "/hls/"),
)


def _relay_command_allowed(method: str, path: str) -> bool:
    if (method, path) in _ALLOWED_COMMANDS:
        return True
    return any(method == m and path.startswith(p) for m, p in _ALLOWED_PATH_PREFIXES)


async def relay_via_websocket(
    camera_id: UUID4,
    method: str,
    path: str,
    params: dict | None = None,
    body: dict | None = None,
    *,
    error_msg: str | None = None,
    expect_binary: bool = False,
    redis: Redis | None = None,
) -> RelayResponse:
    """Send an allowlisted command to a camera over its WebSocket connection.

    If the camera's WebSocket is registered in this worker the command is sent
    directly (fast path).  When it lives in a different worker process,
    ``redis`` is used to bridge the request via ``cross_worker_relay`` — the
    owning worker picks up the command, forwards it to the Pi, and posts the
    response back.  Pass ``redis=None`` to disable cross-worker bridging (the
    call will raise 503 when the camera is not connected locally).
    """
    normalized_method = method.upper()
    if not _relay_command_allowed(normalized_method, path):
        raise HTTPException(status_code=403, detail=f"Relay command is not allowed: {normalized_method} {path}")

    manager = get_connection_manager()
    timeout = BINARY_COMMAND_TIMEOUT if expect_binary else DEFAULT_COMMAND_TIMEOUT

    try:
        async with asyncio.timeout(timeout):
            json_resp, binary = await manager.send_command(camera_id, normalized_method, path, params=params, body=body)
    except RuntimeError as exc:
        # Camera not connected in this worker — try the cross-worker bridge.
        if redis is not None:
            logger.debug("Camera %s not in local manager; attempting cross-worker relay.", camera_id)
            try:
                async with asyncio.timeout(timeout):
                    json_resp, binary = await relay_cross_worker(
                        redis,
                        camera_id,
                        normalized_method,
                        path,
                        params,
                        body,
                        timeout=timeout,
                    )
            except (RuntimeError, TimeoutError) as cross_exc:
                logger.warning("Cross-worker relay failed for camera %s: %s", camera_id, cross_exc)
                raise HTTPException(
                    status_code=503,
                    detail="Camera is not connected via WebSocket.",
                    headers={"Retry-After": _RELAY_RETRY_AFTER_SECONDS},
                ) from cross_exc
        else:
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

    # When the Pi returns a plain text body (e.g. an m3u8 playlist with content-type
    # application/vnd.apple.mpegurl), the relay puts it in the JSON data field as a
    # string rather than as a binary frame. Store it in _content so callers that use
    # relay_response.content (like proxy_hls) receive the actual bytes.
    if isinstance(response_data, str):
        return RelayResponse(status_code=response_status, _content=response_data.encode())

    return RelayResponse(status_code=response_status, _json_data=response_data)
