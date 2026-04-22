"""Relay camera HTTP-style commands through an active WebSocket connection."""
# spell-checker: ignore BLPOP

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from typing import TYPE_CHECKING

from fastapi import HTTPException
from opentelemetry.propagate import inject
from pydantic import UUID4
from redis.exceptions import RedisError
from relab_rpi_cam_models import SAFE_RELAY_TRACE_HEADERS

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

# ── Cross-worker relay circuit breaker ────────────────────────────────────────
# When a camera's WebSocket is not local AND the cross-worker bridge keeps
# failing (camera genuinely offline, not just in another worker), we open a
# per-camera circuit so subsequent requests fast-fail in <1 ms instead of
# paying the full 30 s / 60 s BLPOP timeout. Resets on first success.
#
# State is per-worker (in-process) — each worker learns independently that a
# camera is unreachable. That's fine: the circuit breaker's job is just to
# absorb the stampede of incoming HTTP requests that pile up while a camera
# is down; persistence across workers is not required.
_CROSS_WORKER_CB_FAILURE_THRESHOLD = 3
_CROSS_WORKER_CB_COOL_DOWN_S = 30.0
# Map[camera_id] → (consecutive_failures, open_until_monotonic). Local counter;
# threshold crossings publish an "open" marker to Redis so other workers also
# fast-fail without each having to rediscover the camera is offline.
_cross_worker_cb_state: dict[UUID4, tuple[int, float]] = {}


def _cb_redis_key(camera_id: UUID4) -> str:
    return f"rpi_cam:cb:{camera_id}"


async def _cb_is_open(camera_id: UUID4, redis: Redis | None, *, now: float | None = None) -> bool:
    """Return True if the cross-worker circuit for ``camera_id`` is currently open."""
    entry = _cross_worker_cb_state.get(camera_id)
    if entry is not None:
        _failures, open_until = entry
        if (now if now is not None else time.monotonic()) < open_until:
            return True
    if redis is None:
        return False
    try:
        exists = await redis.exists(_cb_redis_key(camera_id))
    except TimeoutError, RedisError, OSError, ConnectionError:
        return False
    return bool(exists)


async def _cb_record_success(camera_id: UUID4, redis: Redis | None) -> None:
    """Reset circuit state on a successful cross-worker call."""
    _cross_worker_cb_state.pop(camera_id, None)
    if redis is not None:
        with contextlib.suppress(Exception):
            await redis.delete(_cb_redis_key(camera_id))


async def _cb_record_failure(camera_id: UUID4, redis: Redis | None) -> None:
    """Record a failed cross-worker call; open the circuit at the threshold."""
    failures, _ = _cross_worker_cb_state.get(camera_id, (0, 0.0))
    failures += 1
    open_until = (
        time.monotonic() + _CROSS_WORKER_CB_COOL_DOWN_S if failures >= _CROSS_WORKER_CB_FAILURE_THRESHOLD else 0.0
    )
    _cross_worker_cb_state[camera_id] = (failures, open_until)
    if open_until:
        logger.warning(
            "Cross-worker relay circuit opened for camera %s after %d failures; "
            "fast-failing subsequent requests for %.0fs",
            camera_id,
            failures,
            _CROSS_WORKER_CB_COOL_DOWN_S,
        )
        if redis is not None:
            with contextlib.suppress(Exception):
                await redis.set(_cb_redis_key(camera_id), "1", ex=int(_CROSS_WORKER_CB_COOL_DOWN_S))


def _reset_cross_worker_cb_for_tests() -> None:
    """Test hook: clear all per-camera circuit breaker state."""
    _cross_worker_cb_state.clear()


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
    if await _cb_is_open(camera_id, redis):
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
        await _cb_record_failure(camera_id, redis)
        raise

    await _cb_record_success(camera_id, redis)
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
            logger.warning("Camera %s not connected for relay: %s", camera_id, exc)
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
            camera_id,
            response_status,
            normalized_method,
            path,
            response_data,
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
