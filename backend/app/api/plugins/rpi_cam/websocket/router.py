"""WebSocket endpoint that RPi cameras connect to for the relay tunnel."""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from jwt import InvalidTokenError, PyJWK
from pydantic import UUID4
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.services import mark_camera_offline, mark_camera_online
from app.api.plugins.rpi_cam.websocket.connection_manager import CameraConnectionManager
from app.api.plugins.rpi_cam.websocket.protocol import MSG_PING, MSG_PONG, MSG_RESPONSE
from app.core.database import get_async_session
from app.core.logging import sanitize_log_value
from app.core.middleware.client_ip import extract_client_ip

if TYPE_CHECKING:
    from collections.abc import Mapping

    from redis.asyncio import Redis

logger = logging.getLogger(__name__)

router = APIRouter()

_WS_DISCONNECT = "websocket.disconnect"
_WS_TEXT = "text"
_WS_BYTES = "bytes"

_HEARTBEAT_INTERVAL = 30.0
_HEARTBEAT_TIMEOUT = 90.0
_MAX_AUTH_FAILURES = 5
_AUTH_LOCKOUT_SECONDS = 300.0
_auth_failures: dict[str, tuple[int, float]] = {}

_ASSERTION_AUDIENCE = "relab-rpi-cam-relay"
_ASSERTION_ALGORITHMS = ["ES256"]
_REPLAY_KEY_PREFIX = "rpi_cam:relay_assertion_jti:"
_MAX_ASSERTION_TTL_SECONDS = 5 * 60


@router.websocket("/plugins/rpi-cam/ws/connect")
async def camera_websocket_connect(websocket: WebSocket, camera_id: UUID4) -> None:
    """Persistent WebSocket connection for an RPi camera relay tunnel."""
    if not await _authenticate(websocket, camera_id):
        return

    await websocket.accept()

    manager: CameraConnectionManager = websocket.app.state.camera_connection_manager
    await manager.register(camera_id, websocket)

    redis = getattr(websocket.app.state, "redis", None)

    last_pong_at: list[float] = [asyncio.get_running_loop().time()]
    heartbeat = asyncio.create_task(
        _heartbeat_loop(websocket, camera_id, last_pong_at),
        name=f"ws-heartbeat-{camera_id}",
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
        manager.unregister(camera_id)
        if redis:
            await mark_camera_offline(redis, camera_id)


async def _authenticate(websocket: WebSocket, camera_id: UUID4) -> bool:
    """Validate a short-lived signed camera device assertion."""
    client_ip = extract_client_ip(websocket.headers, websocket.client.host if websocket.client else "unknown")
    loop = asyncio.get_running_loop()

    fail_count, last_fail_at = _auth_failures.get(client_ip, (0, 0.0))
    if loop.time() - last_fail_at > _AUTH_LOCKOUT_SECONDS:
        fail_count = 0
    if fail_count >= _MAX_AUTH_FAILURES:
        logger.warning("Auth from %s blocked — too many failures.", sanitize_log_value(client_ip))
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Too many failed attempts.")
        return False

    assertion = _extract_bearer_token(websocket)
    if not assertion:
        _record_auth_failure(client_ip, fail_count, loop.time())
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing Authorization header.")
        return False

    camera = await _get_camera(camera_id)
    if camera is None or not camera.credential_is_active:
        _record_auth_failure(client_ip, fail_count, loop.time())
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication failed.")
        return False

    redis = getattr(websocket.app.state, "redis", None)
    if redis is None:
        logger.error("Redis is required for RPi camera relay assertion replay protection.")
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR, reason="Authentication service unavailable.")
        return False

    try:
        payload = await _verify_device_assertion(assertion, camera, redis)
    except InvalidTokenError as exc:
        logger.warning(
            "Camera %s assertion rejected from %s: %s",
            sanitize_log_value(camera_id),
            sanitize_log_value(client_ip),
            sanitize_log_value(exc),
        )
        _record_auth_failure(client_ip, fail_count, loop.time())
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication failed.")
        return False

    await mark_camera_online(redis, camera_id)
    _auth_failures.pop(client_ip, None)
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





async def _verify_device_assertion(assertion: str, camera: Camera, redis: Redis) -> dict[str, Any]:
    header = jwt.get_unverified_header(assertion)
    if header.get("alg") not in _ASSERTION_ALGORITHMS:
        msg = "Unsupported assertion algorithm"
        raise InvalidTokenError(msg)
    if header.get("kid") != camera.relay_key_id:
        msg_0 = "Assertion key id does not match camera credential"
        raise InvalidTokenError(msg_0)

    public_key = PyJWK.from_dict(camera.relay_public_key_jwk).key
    payload = jwt.decode(
        assertion,
        key=public_key,
        algorithms=_ASSERTION_ALGORITHMS,
        audience=_ASSERTION_AUDIENCE,
        options={"require": ["exp", "iat", "nbf", "jti", "sub"]},
    )
    expected_subject = f"camera:{camera.id}"
    if payload.get("sub") != expected_subject:
        msg_1 = "Assertion subject does not match camera"
        raise InvalidTokenError(msg_1)

    jti = str(payload.get("jti") or "")
    if not jti:
        msg_2 = "Missing assertion id"
        raise InvalidTokenError(msg_2)
    ttl = _assertion_replay_ttl(payload)
    was_set = await redis.set(f"{_REPLAY_KEY_PREFIX}{camera.id}:{jti}", "1", ex=ttl, nx=True)
    if not was_set:
        msg_3 = "Assertion replay detected"
        raise InvalidTokenError(msg_3)
    payload["kid"] = header.get("kid")
    return payload


def _assertion_replay_ttl(payload: Mapping[str, Any]) -> int:
    exp = int(payload["exp"])
    now = int(datetime.now(UTC).timestamp())
    return max(1, min(exp - now, _MAX_ASSERTION_TTL_SECONDS))


def _record_auth_failure(ip: str, current_count: int, now: float) -> None:
    new_count = current_count + 1
    _auth_failures[ip] = (new_count, now)
    logger.warning(
        "Auth failure from %s (%d/%d before lockout).", sanitize_log_value(ip), new_count, _MAX_AUTH_FAILURES
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
    msg_id = msg.get("id")
    if not msg_id:
        return pending_id, pending_json

    if msg.get("has_binary", False):
        return msg_id, msg

    manager.resolve_json(msg_id, msg, None)
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
