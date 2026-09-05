"""Relay camera HTTP-style commands through an active WebSocket connection."""

import asyncio
import logging
from typing import TYPE_CHECKING

from fastapi import HTTPException
from opentelemetry.propagate import inject
from pydantic import UUID4
from relab_rpi_cam_models import RELAY_COMMAND_FORBIDDEN_DETAIL, extract_safe_relay_headers, relay_command_is_allowed

from app.api.plugins.rpi_cam.relay_response import RelayResponse
from app.api.plugins.rpi_cam.runtime.status import get_camera_online_cache_key
from app.api.plugins.rpi_cam.websocket.connection_manager import (
    DEFAULT_COMMAND_TIMEOUT,
    CameraDisconnectedDuringCommandError,
)
from app.api.plugins.rpi_cam.websocket.cross_worker_relay import RelayCommandRejectedError, relay_cross_worker
from app.api.plugins.rpi_cam.websocket.runtime_state import get_connection_manager
from app.core.logging import sanitize_log_value
from app.core.redis import get_redis_value

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
    """Dispatch a relay command across worker processes.

    Fast-fails with ``HTTPException(503)`` when the camera's heartbeat-maintained
    online key is absent — no worker holds its socket, so waiting out the BLPOP
    timeout would be pointless. A Redis outage also fast-fails: the bridge itself
    runs on Redis, so the relay attempt could not succeed anyway.
    """
    # NOTE: this online-key check replaced the cross-worker circuit breaker. Ceiling:
    # if the owning worker's relay listener dies while its heartbeat keeps the key
    # alive, every request waits out the full BLPOP timeout. Bring back a
    # failure-count breaker if that mode shows up in practice.
    if not await get_redis_value(redis, get_camera_online_cache_key(camera_id)):
        logger.debug("Camera %s is not marked online; skipping cross-worker relay.", camera_id)
        raise _camera_not_connected()

    logger.debug("Camera %s not in local manager; attempting cross-worker relay.", camera_id)
    try:
        # relay_cross_worker enforces timeout_s internally via its deadline.
        return await relay_cross_worker(
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
        raise


def _build_relay_trace_headers() -> dict[str, str]:
    """Inject the current trace context into relay-safe headers."""
    carrier: dict[str, str] = {}
    inject(carrier)
    return extract_safe_relay_headers(carrier)


async def _fall_back_to_cross_worker_relay(
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
    """Try the cross-worker bridge, translating its failures to the right HTTP status."""
    try:
        return await _attempt_cross_worker_relay(
            redis,
            camera_id,
            method,
            path,
            params,
            body,
            headers,
            timeout_s=timeout_s,
        )
    except HTTPException:
        raise
    except RelayCommandRejectedError as cross_exc:
        # The owning worker's allowlist re-check rejected the command — surface the
        # original 4xx status rather than masking it as a generic 503.
        raise HTTPException(status_code=cross_exc.status_code, detail=cross_exc.detail) from cross_exc
    except (RuntimeError, TimeoutError) as cross_exc:
        raise _camera_not_connected() from cross_exc


async def relay_via_websocket(
    camera_id: UUID4,
    method: str,
    path: str,
    params: dict | None = None,
    body: dict | None = None,
    *,
    error_msg: str | None = None,
    redis: Redis,
) -> RelayResponse:
    """Send an allowlisted command to a camera over its WebSocket connection.

    If the camera's WebSocket is registered in this worker the command is sent
    directly (fast path).  When it lives in a different worker process,
    ``redis`` is used to bridge the request via ``cross_worker_relay`` — the
    owning worker picks up the command, forwards it to the Pi, and posts the
    response back.
    """
    normalized_method = method.upper()
    if not relay_command_is_allowed(normalized_method, path):
        logger.warning(
            "Blocked relay command %s %s for camera %s.",
            sanitize_log_value(normalized_method),
            sanitize_log_value(path),
            sanitize_log_value(camera_id),
        )
        raise HTTPException(status_code=403, detail=RELAY_COMMAND_FORBIDDEN_DETAIL)

    manager = get_connection_manager()
    timeout = DEFAULT_COMMAND_TIMEOUT
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
    except CameraDisconnectedDuringCommandError as exc:
        # This worker owned the socket and it disconnected mid-command — the camera is
        # gone, not just "not registered here". Don't fall through to the cross-worker
        # bridge (no other worker can reach it either).
        raise _camera_not_connected() from exc
    except RuntimeError:
        # Camera not connected in this worker — try the cross-worker bridge.
        json_resp, binary = await _fall_back_to_cross_worker_relay(
            redis,
            camera_id,
            normalized_method,
            path,
            params,
            body,
            relay_headers or None,
            timeout_s=timeout,
        )
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
