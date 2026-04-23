"""WebSocket endpoint that RPi cameras connect to for the relay tunnel."""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from collections.abc import Mapping
from typing import TYPE_CHECKING

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from jwt import InvalidTokenError
from pydantic import UUID4
from relab_rpi_cam_models import RelayResponseEnvelope
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.plugins.rpi_cam.device_assertion import verify_device_assertion
from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.services import mark_camera_offline, mark_camera_online
from app.api.plugins.rpi_cam.websocket.connection_manager import CameraConnectionManager
from app.api.plugins.rpi_cam.websocket.cross_worker_relay import run_relay_listener
from app.api.plugins.rpi_cam.websocket.protocol import MSG_PING, MSG_PONG, MSG_RESPONSE
from app.core.database import get_async_session
from app.core.logging import sanitize_log_value
from app.core.middleware.client_ip import extract_client_ip
from app.core.runtime import get_connection_redis, require_connection_camera_manager, require_connection_redis

if TYPE_CHECKING:
    from collections.abc import Mapping
    from typing import Any

    from redis.asyncio import Redis

logger = logging.getLogger(__name__)

router = APIRouter()

_WS_DISCONNECT = "websocket.disconnect"
_WS_TEXT = "text"
_WS_BYTES = "bytes"

_HEARTBEAT_INTERVAL = 30.0
_HEARTBEAT_TIMEOUT = 90.0
_MAX_AUTH_FAILURES = 5
_MAX_CAMERA_AUTH_FAILURES = 20
_AUTH_LOCKOUT_SECONDS = 300.0
_auth_failures: dict[str, tuple[int, float]] = {}
_camera_auth_failures: dict[str, tuple[int, float]] = {}


@router.websocket("/plugins/rpi-cam/ws/connect")
async def camera_websocket_connect(websocket: WebSocket, camera_id: UUID4) -> None:
    """Persistent WebSocket connection for an RPi camera relay tunnel."""
    if not await _authenticate(websocket, camera_id):
        return

    await websocket.accept()

    manager: CameraConnectionManager = require_connection_camera_manager(websocket)
    await manager.register(camera_id, websocket)

    redis = get_connection_redis(websocket)

    last_pong_at: list[float] = [asyncio.get_running_loop().time()]
    heartbeat = asyncio.create_task(
        _heartbeat_loop(websocket, camera_id, last_pong_at),
        name=f"ws-heartbeat-{camera_id}",
    )
    # Cross-worker relay listener: allows other Uvicorn worker processes to
    # dispatch relay commands to this worker (the one holding the WebSocket).
    relay_listener: asyncio.Task | None = None
    if redis is not None:
        relay_listener = asyncio.create_task(
            run_relay_listener(redis, camera_id, manager),
            name=f"ws-relay-listener-{camera_id}",
        )
    try:
        await _receive_loop(websocket, camera_id, manager, last_pong_at, redis)
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("Unexpected error in WebSocket receive loop for camera %s", sanitize_log_value(camera_id))
    finally:
        heartbeat.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await heartbeat
        if relay_listener is not None:
            relay_listener.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await relay_listener
        manager.unregister(camera_id)
        if redis:
            await mark_camera_offline(redis, camera_id)


async def _check_lockout(websocket: WebSocket, client_ip: str, camera_key: str, now: float) -> tuple[int, int] | None:
    """Return (ip_count, camera_count) if caller is not locked out, else None."""
    fail_count, last_fail_at = _auth_failures.get(client_ip, (0, 0.0))
    if now - last_fail_at > _AUTH_LOCKOUT_SECONDS:
        fail_count = 0
    if fail_count >= _MAX_AUTH_FAILURES:
        logger.warning("Auth from %s blocked — too many failures.", sanitize_log_value(client_ip))
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Too many failed attempts.")
        return None

    cam_fail_count, cam_last_fail_at = _camera_auth_failures.get(camera_key, (0, 0.0))
    if now - cam_last_fail_at > _AUTH_LOCKOUT_SECONDS:
        cam_fail_count = 0
    if cam_fail_count >= _MAX_CAMERA_AUTH_FAILURES:
        logger.warning("Auth for camera %s blocked — too many failures.", sanitize_log_value(camera_key))
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Too many failed attempts.")
        return None

    return fail_count, cam_fail_count


async def _authenticate(websocket: WebSocket, camera_id: UUID4) -> bool:
    """Validate a short-lived signed camera device assertion."""
    client_ip = extract_client_ip(websocket.headers, websocket.client.host if websocket.client else "unknown")
    camera_key = str(camera_id)
    loop = asyncio.get_running_loop()

    lockout = await _check_lockout(websocket, client_ip, camera_key, loop.time())
    if lockout is None:
        return False
    fail_count, cam_fail_count = lockout

    assertion = _extract_bearer_token(websocket)
    if not assertion:
        _record_auth_failure(client_ip, camera_key, fail_count, cam_fail_count, loop.time())
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing Authorization header.")
        return False

    camera = await _get_camera(camera_id)
    if camera is None or not camera.credential_is_active:
        _record_auth_failure(client_ip, camera_key, fail_count, cam_fail_count, loop.time())
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication failed.")
        return False

    try:
        redis = require_connection_redis(websocket)
    except RuntimeError as exc:
        logger.warning("Redis is required for RPi camera relay assertion replay protection: %s", exc)
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR, reason="Authentication service unavailable.")
        return False

    try:
        payload = await verify_device_assertion(assertion, camera, redis)
    except InvalidTokenError as exc:
        logger.warning(
            "Camera %s assertion rejected from %s: %s",
            sanitize_log_value(camera_id),
            sanitize_log_value(client_ip),
            sanitize_log_value(exc),
        )
        _record_auth_failure(client_ip, camera_key, fail_count, cam_fail_count, loop.time())
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication failed.")
        return False

    await mark_camera_online(redis, camera_id)
    _auth_failures.pop(client_ip, None)
    _camera_auth_failures.pop(camera_key, None)
    logger.info(
        "Camera %s authenticated from %s with key %s.",
        sanitize_log_value(camera_id),
        sanitize_log_value(client_ip),
        sanitize_log_value(payload.get("kid") or camera.relay_key_id),
    )
    return True


def _extract_bearer_token(websocket: WebSocket) -> str:
    raw_auth = websocket.headers.get("Authorization", "")
    return raw_auth.removeprefix("Bearer ").strip()


async def _get_camera(camera_id: UUID4) -> Camera | None:
    session_gen = get_async_session()
    session: AsyncSession = await session_gen.__anext__()
    try:
        return await session.get(Camera, camera_id)
    finally:
        await session.close()


def _record_auth_failure(ip: str, camera_key: str, ip_count: int, camera_count: int, now: float) -> None:
    new_ip = ip_count + 1
    new_cam = camera_count + 1
    _auth_failures[ip] = (new_ip, now)
    _camera_auth_failures[camera_key] = (new_cam, now)
    logger.warning(
        "Auth failure (ip=%s %d/%d; camera=%s %d/%d).",
        sanitize_log_value(ip),
        new_ip,
        _MAX_AUTH_FAILURES,
        sanitize_log_value(camera_key),
        new_cam,
        _MAX_CAMERA_AUTH_FAILURES,
    )


async def _heartbeat_loop(websocket: WebSocket, camera_id: UUID4, last_pong_at: list[float]) -> None:
    """Send periodic pings; disconnect if no pong arrives within the timeout."""
    loop = asyncio.get_running_loop()
    while True:
        await asyncio.sleep(_HEARTBEAT_INTERVAL)
        elapsed = loop.time() - last_pong_at[0]
        if elapsed > _HEARTBEAT_TIMEOUT:
            logger.warning(
                "Camera %s heartbeat timeout (%.0fs since last pong); closing.", sanitize_log_value(camera_id), elapsed
            )
            with contextlib.suppress(Exception):
                await websocket.close(code=1001)
            return
        with contextlib.suppress(Exception):
            await websocket.send_text(json.dumps({"type": MSG_PING}))


async def _receive_loop(
    websocket: WebSocket,
    camera_id: UUID4,
    manager: CameraConnectionManager,
    last_pong_at: list[float],
    redis: Redis | None,
) -> None:
    """Process incoming frames until the connection closes or a disconnect frame arrives."""
    pending_binary_id: str | None = None
    pending_binary_json: dict | None = None

    while True:
        raw = await websocket.receive()

        if raw["type"] == _WS_DISCONNECT:
            break

        if _WS_TEXT in raw:
            pending_binary_id, pending_binary_json = await _handle_text_frame(
                raw, camera_id, manager, pending_binary_id, pending_binary_json, last_pong_at, redis
            )
        elif _WS_BYTES in raw:
            pending_binary_id, pending_binary_json = _handle_binary_frame(
                raw, camera_id, manager, pending_binary_id, pending_binary_json
            )


async def _handle_text_frame(
    raw: Mapping[str, Any],
    camera_id: UUID4,
    manager: CameraConnectionManager,
    pending_id: str | None,
    pending_json: dict | None,
    last_pong_at: list[float],
    redis: Redis | None,
) -> tuple[str | None, dict | None]:
    """Parse a text frame and dispatch it to the appropriate handler."""
    try:
        msg = json.loads(raw[_WS_TEXT])
    except json.JSONDecodeError:
        logger.warning("Camera %s sent invalid JSON, ignoring.", sanitize_log_value(camera_id))
        return pending_id, pending_json

    msg_type = msg.get("type")

    if msg_type == MSG_PONG:
        last_pong_at[0] = asyncio.get_running_loop().time()
        if redis:
            await mark_camera_online(redis, camera_id)
    elif msg_type == MSG_PING:
        await manager.handle_ping(camera_id)
        if redis:
            await mark_camera_online(redis, camera_id)
    elif msg_type == MSG_RESPONSE:
        return _handle_response(msg, manager, pending_id, pending_json)

    return pending_id, pending_json


def _handle_response(
    msg: dict,
    manager: CameraConnectionManager,
    pending_id: str | None,
    pending_json: dict | None,
) -> tuple[str | None, dict | None]:
    """Resolve or defer a response frame depending on whether binary data follows."""
    envelope = RelayResponseEnvelope.model_validate(msg)
    msg_id = envelope.id
    if not msg_id:
        return pending_id, pending_json

    if envelope.has_binary:
        return msg_id, envelope.model_dump(mode="json")

    manager.resolve_json(msg_id, envelope.model_dump(mode="json"), None)
    return None, None


def _handle_binary_frame(
    raw: Mapping[str, Any],
    camera_id: UUID4,
    manager: CameraConnectionManager,
    pending_id: str | None,
    pending_json: dict | None,
) -> tuple[str | None, dict | None]:
    """Pair an incoming binary frame with its preceding JSON header."""
    binary_data: bytes = raw[_WS_BYTES]
    if pending_id and pending_json is not None:
        manager.resolve_json(pending_id, pending_json, binary_data)
        return None, None

    logger.warning("Camera %s sent unexpected binary frame, ignoring.", sanitize_log_value(camera_id))
    return pending_id, pending_json
