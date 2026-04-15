"""Cross-worker relay bridge for the RPi camera WebSocket tunnel.

With multiple Uvicorn worker processes, a camera's WebSocket connection is
registered in exactly one worker's ``CameraConnectionManager``. HTTP relay
requests (HLS, image capture, telemetry, …) round-robin across all workers,
so the request may land on a different worker than the one holding the socket.

This module provides a Redis-based bridge so any worker can dispatch a relay
command to the worker that owns the connection:

::

    Worker A (HTTP request)            Worker B (holds WebSocket)
    ───────────────────────────────────────────────────────────────
    relay_cross_worker()
      RPUSH relay_cmd:{camera_id}  ──► run_relay_listener()
        {msg_id, method, path, …}       BLPOP relay_cmd:{camera_id}
      BLPOP relay_resp:{msg_id}    ◄──  manager.send_command() → Pi
        timeout = 30 s / 60 s          RPUSH relay_resp:{msg_id}

Binary payloads (HLS segments, captured images) are base-64 encoded inside
the JSON response so a single ``decode_responses=True`` Redis client suffices.
"""
# spell-checker: ignore RPUSH, BLPOP

from __future__ import annotations

import asyncio
import base64
import contextlib
import inspect
import json
import logging
import time
import uuid
from typing import TYPE_CHECKING, cast

from app.core.logging import sanitize_log_value

if TYPE_CHECKING:
    from collections.abc import Awaitable

    from pydantic import UUID4
    from redis.asyncio import Redis

    from app.api.plugins.rpi_cam.websocket.connection_manager import CameraConnectionManager

logger = logging.getLogger(__name__)

# ── Blocking Redis singleton ───────────────────────────────────────────────────
# BLPOP requires socket_timeout=None; the shared app Redis client uses
# socket_timeout=5 which causes TimeoutError mid-wait.  main.py calls
# set_blocking_redis() at startup with a dedicated client.

_blocking_redis_state: dict[str, Redis | None] = {"client": None}


def set_blocking_redis(client: Redis | None) -> None:
    """Register the blocking Redis client (called once at startup)."""
    _blocking_redis_state["client"] = client


def get_blocking_redis() -> Redis | None:
    """Return the blocking Redis client, or None if unavailable."""
    return _blocking_redis_state["client"]


# ── Redis key templates ────────────────────────────────────────────────────────


def _cmd_key(camera_id: UUID4) -> str:
    return f"rpi_cam:relay_cmd:{camera_id}"


def _resp_key(msg_id: str) -> str:
    return f"rpi_cam:relay_resp:{msg_id}"


# Expire stale response keys in case the requesting worker dies before reading.
_RESP_TTL_SECONDS = 120


async def _await_redis_result[T](result: Awaitable[T] | T) -> T:
    """Await Redis calls only when the type checker cannot prove they are async."""
    if inspect.isawaitable(result):
        return await cast("Awaitable[T]", result)
    return cast("T", result)


# ── Requesting-worker side ─────────────────────────────────────────────────────


async def relay_cross_worker(
    redis: Redis,
    camera_id: UUID4,
    method: str,
    path: str,
    params: dict | None,
    body: dict | None,
    *,
    timeout_s: float,
) -> tuple[dict, bytes | None]:
    """Send a relay command to whichever worker holds the camera's WebSocket.

    Pushes the command onto a per-camera Redis list and blocks on a
    per-request response list until the owning worker replies or the timeout
    fires.

    Returns:
        ``(json_response_dict, binary_bytes_or_None)`` — same shape as
        ``CameraConnectionManager.send_command``.

    Raises:
        RuntimeError: Camera did not respond (timeout or listener reported an
            error).  Callers convert this to HTTP 503.
    """
    msg_id = str(uuid.uuid4())
    deadline = time.monotonic() + timeout_s

    command_payload = json.dumps(
        {
            "msg_id": msg_id,
            "method": method,
            "path": path,
            "params": params,
            "body": body,
            "deadline": time.time() + timeout_s,  # wall-clock for cross-process comparison
        }
    )

    resp_key = _resp_key(msg_id)

    await _await_redis_result(redis.rpush(_cmd_key(camera_id), command_payload))

    remaining = deadline - time.monotonic()
    if remaining <= 0:
        msg = f"Relay deadline already passed before waiting for response: {path}"
        raise RuntimeError(msg)

    # Use the blocking client (socket_timeout=None) so BLPOP can wait for the
    # full relay timeout without the socket being closed prematurely.
    blocking_redis = get_blocking_redis() or redis
    try:
        async with asyncio.timeout(remaining):
            result = await _await_redis_result(blocking_redis.blpop(resp_key, timeout=0))
    except TimeoutError as exc:
        msg = f"Cross-worker relay timed out waiting for camera response: {path}"
        raise RuntimeError(msg) from exc
    if result is None:
        msg = f"Cross-worker relay timed out waiting for camera response: {path}"
        raise RuntimeError(msg)

    _key, raw_resp = result
    try:
        resp = json.loads(raw_resp)
    except json.JSONDecodeError as exc:
        msg = f"Cross-worker relay received malformed response JSON: {raw_resp!r}"
        raise RuntimeError(msg) from exc

    if error := resp.get("error"):
        raise RuntimeError(error)

    json_data: dict = resp.get("data") or {}
    # Restore the full relay response structure the caller expects.
    json_resp = {
        "status": resp.get("status", 500),
        "data": json_data,
    }

    binary: bytes | None = None
    if binary_b64 := resp.get("binary_b64"):
        try:
            binary = base64.b64decode(binary_b64)
        except Exception as exc:
            msg = "Cross-worker relay could not decode binary payload"
            raise RuntimeError(msg) from exc

    return json_resp, binary


# ── Camera-owning-worker side ──────────────────────────────────────────────────


async def run_relay_listener(
    redis: Redis,
    camera_id: UUID4,
    manager: CameraConnectionManager,
) -> None:
    """Background task: service cross-worker relay commands for one camera.

    Runs for the lifetime of the camera's WebSocket connection.  Cancelled
    (via ``asyncio.Task.cancel()``) when the camera disconnects.

    The task pops commands from ``rpi_cam:relay_cmd:{camera_id}``, relays each
    to the camera via the local ``CameraConnectionManager``, and pushes the
    response to ``rpi_cam:relay_resp:{msg_id}`` so the requesting worker can
    read it with ``BLPOP``.
    """
    cmd_key = _cmd_key(camera_id)
    camera_log_id = sanitize_log_value(camera_id)
    # Use the blocking client (socket_timeout=None) for the indefinite BLPOP.
    blocking_redis = get_blocking_redis() or redis
    logger.debug("Cross-worker relay listener started for camera %s", camera_log_id)

    try:
        while True:
            # Block until a command arrives or the task is cancelled.
            # timeout=0 means "block indefinitely" in redis-py.
            try:
                result = await _await_redis_result(blocking_redis.blpop(cmd_key, timeout=0))
            except asyncio.CancelledError:
                break

            if result is None:
                # Should not happen with timeout=0, but guard defensively.
                continue

            _key, raw_cmd = result
            try:
                cmd = json.loads(raw_cmd)
            except json.JSONDecodeError:
                logger.warning(
                    "Relay listener for camera %s received malformed command JSON, skipping.",
                    camera_log_id,
                )
                continue

            msg_id: str = cmd.get("msg_id", "")
            msg_log_id = sanitize_log_value(msg_id)
            if not msg_id:
                logger.warning("Relay listener received command without msg_id, skipping.")
                continue

            # Honour the deadline set by the requesting worker.
            deadline: float = cmd.get("deadline", 0.0)
            if deadline and time.time() > deadline:
                logger.debug(
                    "Relay listener skipping expired command %s for camera %s",
                    msg_log_id,
                    camera_log_id,
                )
                continue

            await _execute_and_respond(redis, camera_id, manager, cmd, msg_id)

    except asyncio.CancelledError:
        pass
    finally:
        logger.debug("Cross-worker relay listener stopped for camera %s", camera_log_id)


async def _execute_and_respond(
    redis: Redis,
    camera_id: UUID4,
    manager: CameraConnectionManager,
    cmd: dict,
    msg_id: str,
) -> None:
    """Execute one relayed command and push the response to Redis."""
    resp_key = _resp_key(msg_id)
    camera_log_id = sanitize_log_value(camera_id)
    msg_log_id = sanitize_log_value(msg_id)
    method: str = cmd.get("method", "GET")
    path: str = cmd.get("path", "/")
    params: dict | None = cmd.get("params")
    body: dict | None = cmd.get("body")

    try:
        json_resp, binary = await manager.send_command(camera_id, method, path, params=params, body=body)
    except RuntimeError as exc:
        # Camera disconnected mid-flight — report error and stop listening.
        logger.warning(
            "Relay listener: camera %s disconnected during cross-worker command %s: %s",
            camera_log_id,
            msg_log_id,
            sanitize_log_value(exc),
        )
        error_payload = json.dumps({"error": str(exc)})
        with contextlib.suppress(Exception):
            await _await_redis_result(redis.rpush(resp_key, error_payload))
            await _await_redis_result(redis.expire(resp_key, _RESP_TTL_SECONDS))
        return
    except Exception as exc:
        logger.exception(
            "Relay listener: unexpected error executing command %s for camera %s",
            msg_log_id,
            camera_log_id,
        )
        error_payload = json.dumps({"error": f"Internal relay error: {exc}"})
        with contextlib.suppress(Exception):
            await _await_redis_result(redis.rpush(resp_key, error_payload))
            await _await_redis_result(redis.expire(resp_key, _RESP_TTL_SECONDS))
        return

    response: dict = {
        "status": json_resp.get("status", 500),
        "data": json_resp.get("data"),
    }
    if binary is not None:
        response["binary_b64"] = base64.b64encode(binary).decode()

    try:
        await _await_redis_result(redis.rpush(resp_key, json.dumps(response)))
        await _await_redis_result(redis.expire(resp_key, _RESP_TTL_SECONDS))
    except Exception:
        logger.exception(
            "Relay listener: failed to push response for command %s (camera %s)",
            msg_log_id,
            camera_log_id,
        )
