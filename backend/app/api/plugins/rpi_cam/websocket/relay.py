"""Relay camera HTTP-style commands through an active WebSocket connection."""
# spell-checker: ignore BLPOP

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from fastapi import HTTPException
from opentelemetry.propagate import inject
from pydantic import UUID4
from relab_rpi_cam_models import SAFE_RELAY_TRACE_HEADERS

from app.api.plugins.rpi_cam.websocket import cross_worker_circuit_breaker as circuit_breaker
from app.api.plugins.rpi_cam.websocket.connection_manager import (
    BINARY_COMMAND_TIMEOUT,
    DEFAULT_COMMAND_TIMEOUT,
    get_connection_manager,
)
from app.api.plugins.rpi_cam.websocket.cross_worker_relay import relay_cross_worker
from app.api.plugins.rpi_cam.websocket.protocol import RelayResponse
from app.core.logging import sanitize_log_value

if TYPE_CHECKING:
    from redis.asyncio import Redis

logger = logging.getLogger(__name__)
_RELAY_RETRY_AFTER_SECONDS = "2"


def _camera_not_connected() -> HTTPException:
    """Return the canonical 503 for an unreachable camera."""
    return HTTPException(
        status_code=503,
        detail="Camera is not connected via WebSocket.",
        headers={"Retry-After": _RELAY_RETRY_AFTER_SECONDS},
    )


async def _attempt_cross_worker_relay(
    redis: Redis,
    camera_id: UUID4,
    method: str,
    path: str,
    params: dict | None,
    body: dict | None,
    headers: dict[str, str] | None,
    *,
    timeout_s: float,
) -> tuple[dict, bytes | None]:
    """Dispatch a relay command across worker processes, gated by the circuit breaker.

    Raises ``HTTPException(503)`` immediately when the circuit is open to spare
    callers the full BLPOP timeout. Success resets the circuit; failure advances it
    toward the open state.
    """
    if await circuit_breaker.is_open(camera_id, redis):
        logger.debug("Cross-worker relay circuit open for camera %s; fast-failing", camera_id)
        raise _camera_not_connected()

    logger.debug("Camera %s not in local manager; attempting cross-worker relay.", camera_id)
    try:
        async with asyncio.timeout(timeout_s):
            result = await relay_cross_worker(
                redis,
                camera_id,
                method,
                path,
                params,
                body,
                headers,
                timeout_s=timeout_s,
            )
    except (RuntimeError, TimeoutError) as cross_exc:
        logger.warning("Cross-worker relay failed for camera %s: %s", camera_id, cross_exc)
        await circuit_breaker.record_failure(camera_id, redis)
        raise

    await circuit_breaker.record_success(camera_id, redis)
    return result


# Exact (method, path) pairs permitted through the relay. Anything outside this
# set and _ALLOWED_PATH_PREFIXES is rejected with 403.
#
# The relay carries commands only: captured image bytes travel over a direct
# Pi→backend HTTPS upload (see
# ``routers/camera_interaction/images.py::receive_camera_upload``), not
# through this allowlist.
_ALLOWED_COMMANDS = {
    ("GET", "/camera"),
    ("POST", "/captures"),
    ("GET", "/streams/youtube"),
    ("POST", "/streams/youtube"),
    ("DELETE", "/streams/youtube"),
    ("GET", "/system/telemetry"),
    # Sent by the backend when a camera is deleted so the Pi clears its
    # credentials and re-enters pairing mode automatically.
    ("DELETE", "/pairing"),
    # Fetched by the backend on behalf of the frontend to deliver the local
    # API key and candidate IP addresses for Ethernet/USB-C direct-connect setup.
    ("GET", "/system/local-access"),
}

# Dynamic prefixes. Requests where `path.startswith(prefix)` are permitted for
# the matching method. Prefix entries must end in `/` to avoid accidental
# prefix-of-sibling matches.
_ALLOWED_PATH_PREFIXES: tuple[tuple[str, str], ...] = (
    # LL-HLS live preview. The Pi proxies to its local MediaMTX HLS listener
    # on :8888 and returns playlist + segment bytes. Every segment fetch is
    # one relay round-trip — at ~500kbps lores / 200ms parts that's ~12.5 KB
    # per request, which the WebSocket carries fine.
    ("GET", "/preview/hls/"),
)


def _relay_command_allowed(method: str, path: str) -> bool:
    if (method, path) in _ALLOWED_COMMANDS:
        return True
    return any(method == m and path.startswith(p) for m, p in _ALLOWED_PATH_PREFIXES)


def _build_relay_trace_headers() -> dict[str, str]:
    """Inject the current trace context into relay-safe headers."""
    carrier: dict[str, str] = {}
    inject(carrier)
    return {name: carrier[name] for name in SAFE_RELAY_TRACE_HEADERS if name in carrier}


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
    relay_headers = _build_relay_trace_headers()

    try:
        async with asyncio.timeout(timeout):
            json_resp, binary = await manager.send_command(
                camera_id,
                normalized_method,
                path,
                params=params,
                body=body,
                headers=relay_headers or None,
            )
    except RuntimeError as exc:
        # Camera not connected in this worker — try the cross-worker bridge.
        if redis is None:
            logger.warning(
                "Camera %s not connected for relay: %s",
                sanitize_log_value(camera_id),
                sanitize_log_value(exc),
            )
            raise _camera_not_connected() from exc
        try:
            json_resp, binary = await _attempt_cross_worker_relay(
                redis,
                camera_id,
                normalized_method,
                path,
                params,
                body,
                relay_headers or None,
                timeout_s=timeout,
            )
        except HTTPException:
            raise
        except (RuntimeError, TimeoutError) as cross_exc:
            raise _camera_not_connected() from cross_exc
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
        logger.warning(
            "Camera %s returned %d for %s %s: %s",
            sanitize_log_value(camera_id),
            response_status,
            sanitize_log_value(normalized_method),
            sanitize_log_value(path),
            sanitize_log_value(response_data),
        )
        raise HTTPException(status_code=response_status, detail=_detail)

    if binary is not None:
        return RelayResponse(status_code=response_status, _content=binary)

    # When the Pi returns a plain text body (e.g. an m3u8 playlist with content-type
    # application/vnd.apple.mpegurl), the relay puts it in the JSON data field as a
    # string rather than as a binary frame. Store it in _content so callers that use
    # relay_response.content (like proxy_hls) receive the actual bytes.
    if isinstance(response_data, str):
        return RelayResponse(status_code=response_status, _content=response_data.encode())

    return RelayResponse(status_code=response_status, _json_data=response_data)
