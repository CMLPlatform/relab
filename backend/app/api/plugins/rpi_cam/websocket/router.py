"""WebSocket endpoint that RPi cameras connect to for the relay tunnel."""

from __future__ import annotations

import asyncio
import contextlib
import hmac
import json
import logging
from typing import TYPE_CHECKING, Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from pydantic import UUID4
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.utils.encryption import decrypt_str
from app.api.plugins.rpi_cam.websocket.connection_manager import CameraConnectionManager
from app.api.plugins.rpi_cam.websocket.protocol import MSG_PING, MSG_PONG, MSG_RESPONSE
from app.core.database import get_async_session
from app.core.logging import sanitize_log_value
from app.core.middleware.client_ip import extract_client_ip

if TYPE_CHECKING:
    from collections.abc import Mapping

logger = logging.getLogger(__name__)

router = APIRouter()

# Raw WebSocket frame types returned by `websocket.receive()`
_WS_DISCONNECT = "websocket.disconnect"
_WS_TEXT = "text"
_WS_BYTES = "bytes"

# ── Heartbeat (M2) ────────────────────────────────────────────────────────────
_HEARTBEAT_INTERVAL = 30.0  # seconds between backend→camera pings
_HEARTBEAT_TIMEOUT = 90.0  # seconds without a pong before disconnecting

# ── Auth rate limiting (L1) ───────────────────────────────────────────────────
# In-memory; resets on restart. Sufficient for the expected connection pattern
# (a handful of cameras, not public internet traffic).
_MAX_AUTH_FAILURES = 5
_AUTH_LOCKOUT_SECONDS = 300.0  # 5 minutes
_auth_failures: dict[str, tuple[int, float]] = {}  # ip → (count, last_fail_at)


@router.websocket("/plugins/rpi-cam/ws/connect")
async def camera_websocket_connect(
    websocket: WebSocket,
    camera_id: UUID4,
) -> None:
    """Persistent WebSocket connection for an RPi camera relay tunnel.

    The Raspberry Pi connects here on startup. The backend then routes camera
    commands such as capture, status, and stream control through this
    connection instead of making outbound HTTP requests to a public IP.

    Query parameters:
        camera_id: UUID of the camera registered in the ReLab backend.

    Headers:
        Authorization: Bearer <api_key> — plaintext API key returned when the
            camera was created. Sent as a header (not a query param) to keep it
            out of server access logs.
    """
    if not await _authenticate(websocket, camera_id):
        return

    await websocket.accept()

    manager: CameraConnectionManager = websocket.app.state.camera_connection_manager
    await manager.register(camera_id, websocket)

    # Shared mutable timestamp updated by the receive loop on every pong received.
    last_pong_at: list[float] = [asyncio.get_running_loop().time()]
    heartbeat = asyncio.create_task(
        _heartbeat_loop(websocket, camera_id, last_pong_at),
        name=f"ws-heartbeat-{camera_id}",
    )
    try:
        await _receive_loop(websocket, camera_id, manager, last_pong_at)
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception(
            "Unexpected error in WebSocket receive loop for camera %s",
            sanitize_log_value(camera_id),
        )
    finally:
        heartbeat.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await heartbeat
        manager.unregister(camera_id)


# ── Internal helpers ──────────────────────────────────────────────────────────


async def _authenticate(websocket: WebSocket, camera_id: UUID4) -> bool:
    """Validate camera_id and the Bearer token in the Authorization header.

    Closes the socket and returns False on any auth failure. "Camera not found"
    and "wrong key" use the same close reason to prevent camera enumeration.
    Repeated failures from the same IP are rate-limited.
    """
    client_ip = extract_client_ip(websocket.headers, websocket.client.host if websocket.client else "unknown")
    loop = asyncio.get_running_loop()

    # ── Rate limit check ──────────────────────────────────────────────────────
    fail_count, last_fail_at = _auth_failures.get(client_ip, (0, 0.0))
    if loop.time() - last_fail_at > _AUTH_LOCKOUT_SECONDS:
        fail_count = 0  # Lockout period has passed; reset
    if fail_count >= _MAX_AUTH_FAILURES:
        logger.warning("Auth from %s blocked — too many failures.", sanitize_log_value(client_ip))
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Too many failed attempts.")
        return False

    # ── Extract API key ───────────────────────────────────────────────────────
    raw_auth = websocket.headers.get("Authorization", "")
    api_key = raw_auth.removeprefix("Bearer ").strip()
    if not api_key:
        _record_auth_failure(client_ip, fail_count, loop.time())
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing Authorization header.")
        return False

    # ── DB lookup ─────────────────────────────────────────────────────────────
    session_gen = get_async_session()
    session: AsyncSession = await session_gen.__anext__()
    try:
        camera = await session.get(Camera, camera_id)
    finally:
        await session.close()

    if camera is None:
        _record_auth_failure(client_ip, fail_count, loop.time())
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication failed.")
        return False

    if not hmac.compare_digest(decrypt_str(camera.encrypted_api_key), api_key):
        _record_auth_failure(client_ip, fail_count, loop.time())
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication failed.")
        return False

    # ── Success ───────────────────────────────────────────────────────────────
    _auth_failures.pop(client_ip, None)
    logger.info(
        "Camera %s authenticated from %s.",
        sanitize_log_value(camera_id),
        sanitize_log_value(client_ip),
    )
    return True


def _record_auth_failure(ip: str, current_count: int, now: float) -> None:
    new_count = current_count + 1
    _auth_failures[ip] = (new_count, now)
    logger.warning(
        "Auth failure from %s (%d/%d before lockout).",
        sanitize_log_value(ip),
        new_count,
        _MAX_AUTH_FAILURES,
    )


async def _heartbeat_loop(
    websocket: WebSocket,
    camera_id: UUID4,
    last_pong_at: list[float],
) -> None:
    """Send periodic pings; disconnect if no pong arrives within the timeout."""
    loop = asyncio.get_running_loop()
    while True:
        await asyncio.sleep(_HEARTBEAT_INTERVAL)
        elapsed = loop.time() - last_pong_at[0]
        if elapsed > _HEARTBEAT_TIMEOUT:
            logger.warning(
                "Camera %s heartbeat timeout (%.0fs since last pong); closing.",
                sanitize_log_value(camera_id),
                elapsed,
            )
            with contextlib.suppress(Exception):
                await websocket.close(code=1001)  # 1001 = Going Away
            return
        with contextlib.suppress(Exception):
            await websocket.send_text(json.dumps({"type": MSG_PING}))


async def _receive_loop(
    websocket: WebSocket,
    camera_id: UUID4,
    manager: CameraConnectionManager,
    last_pong_at: list[float],
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
                raw, camera_id, manager, pending_binary_id, pending_binary_json, last_pong_at
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
    elif msg_type == MSG_PING:
        await manager.handle_ping(camera_id)
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
        # Binary frame will follow — store this JSON until it arrives.
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
