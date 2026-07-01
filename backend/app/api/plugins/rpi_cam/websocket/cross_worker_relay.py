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
import json
import logging
import time
import uuid
from typing import TYPE_CHECKING, cast

from app.core.logging import sanitize_log_value

if TYPE_CHECKING:
    from pydantic import UUID4
    from redis.asyncio import Redis

    from app.api.plugins.rpi_cam.websocket.connection_manager import CameraConnectionManager

logger = logging.getLogger(__name__)

# ── Redis key templates ────────────────────────────────────────────────────────


def _cmd_key(camera_id: UUID4) -> str:
    return f"rpi_cam:relay_cmd:{camera_id}"


def _resp_key(msg_id: str) -> str:
    return f"rpi_cam:relay_resp:{msg_id}"


# Expire stale response keys in case the requesting worker dies before reading.
_RESP_TTL_MIN_SECONDS = 120

# Cap the number of queued relay commands per camera so a misbehaving requester
# or a slow Pi cannot grow the Redis list unbounded. Oldest commands are
# dropped via LTRIM after the RPUSH; stale commands also self-filter on the
# listener side via their ``deadline`` field.
_CMD_QUEUE_MAX_LEN = 256
_BLPOP_POLL_SECONDS = 1


def _resp_ttl_seconds(timeout_s: float) -> int:
    return max(_RESP_TTL_MIN_SECONDS, int(timeout_s) + 10)


async def _blpop_once(redis: Redis, key: str) -> tuple[str, str] | None:
    """Run one finite BLPOP poll so relay waits outlive the shared client's socket timeout."""
    return cast("tuple[str, str] | None", await redis.blpop(key, timeout=_BLPOP_POLL_SECONDS))


# ── Codec ─────────────────────────────────────────────────────────────────────


def _encode_command(
    msg_id: str,
    method: str,
    path: str,
    params: dict | None,
    body: dict | None,
    headers: dict[str, str] | None,
    deadline: float,
    timeout_s: float,
) -> str:
    return json.dumps(
        {
            "msg_id": msg_id,
            "method": method,
            "path": path,
            "params": params,
            "body": body,
            "headers": headers or {},
            "deadline": deadline,  # wall-clock for cross-process comparison
            "timeout_s": timeout_s,
        }
    )


def _decode_response(raw: str) -> tuple[dict, bytes | None]:
    try:
        resp = json.loads(raw)
    except json.JSONDecodeError as exc:
        msg = f"Cross-worker relay received malformed response JSON: {raw!r}"
        raise RuntimeError(msg) from exc

    if error := resp.get("error"):
        raise RuntimeError(error)

    json_resp: dict = {"status": resp.get("status", 500), "data": resp.get("data") or {}}

    binary: bytes | None = None
    if binary_b64 := resp.get("binary_b64"):
        try:
            binary = base64.b64decode(binary_b64)
        except Exception as exc:
            msg = "Cross-worker relay could not decode binary payload"
            raise RuntimeError(msg) from exc

    return json_resp, binary


def _encode_response(json_resp: dict, binary: bytes | None) -> str:
    response: dict = {"status": json_resp.get("status", 500), "data": json_resp.get("data")}
    if binary is not None:
        response["binary_b64"] = base64.b64encode(binary).decode()
    return json.dumps(response)


# ── Requesting-worker side ─────────────────────────────────────────────────────


async def relay_cross_worker(
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

    command_payload = _encode_command(msg_id, method, path, params, body, headers, time.time() + timeout_s, timeout_s)

    resp_key = _resp_key(msg_id)

    cmd_key = _cmd_key(camera_id)
    await redis.rpush(cmd_key, command_payload)
    # Keep only the most recent _CMD_QUEUE_MAX_LEN entries; older ones self-expire
    # via their deadline on the listener side.
    await redis.ltrim(cmd_key, -_CMD_QUEUE_MAX_LEN, -1)

    remaining = deadline - time.monotonic()
    if remaining <= 0:
        msg = f"Relay deadline already passed before waiting for response: {path}"
        raise RuntimeError(msg)

    try:
        async with asyncio.timeout(remaining):
            while (result := await _blpop_once(redis, resp_key)) is None:
                continue
    except TimeoutError as exc:
        msg = f"Cross-worker relay timed out waiting for camera response: {path}"
        raise RuntimeError(msg) from exc

    _key, raw_resp = result
    return _decode_response(raw_resp)


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
    logger.debug("Cross-worker relay listener started for camera %s", camera_log_id)

    try:
        while True:
            # Block until a command arrives or the task is cancelled.
            try:
                result = await _blpop_once(redis, cmd_key)
            except asyncio.CancelledError:
                break

            if result is None:
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
        # Listener was cancelled on shutdown; exit quietly.
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
    headers: dict[str, str] | None = cmd.get("headers")

    try:
        json_resp, binary = await manager.send_command(
            camera_id,
            method,
            path,
            params=params,
            body=body,
            headers=headers,
        )
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
            await redis.rpush(resp_key, error_payload)
            await redis.expire(resp_key, _resp_ttl_seconds(cmd.get("timeout_s", 0)))
        return
    except Exception as exc:
        logger.exception(
            "Relay listener: unexpected error executing command %s for camera %s",
            msg_log_id,
            camera_log_id,
        )
        error_payload = json.dumps({"error": f"Internal relay error: {exc}"})
        with contextlib.suppress(Exception):
            await redis.rpush(resp_key, error_payload)
            await redis.expire(resp_key, _resp_ttl_seconds(cmd.get("timeout_s", 0)))
        return

    try:
        await redis.rpush(resp_key, _encode_response(json_resp, binary))
        await redis.expire(resp_key, _resp_ttl_seconds(cmd.get("timeout_s", 0)))
    except Exception:
        logger.exception(
            "Relay listener: failed to push response for command %s (camera %s)",
            msg_log_id,
            camera_log_id,
        )
