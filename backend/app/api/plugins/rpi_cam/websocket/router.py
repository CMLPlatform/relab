"""WebSocket endpoint that RPi cameras connect to for the relay tunnel."""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from dataclasses import dataclass, field
from time import monotonic
from typing import TYPE_CHECKING

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from jwt import InvalidTokenError
from pydantic import UUID4, ValidationError
from relab_rpi_cam_models import RELAY_WS_TEXT_FRAME_LIMIT_BYTES, RelayMessageType, RelayResponseEnvelope
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.services.rate_limiter import RateLimitExceededError, limiter, rate_limit_bucket_key
from app.api.plugins.rpi_cam.device_assertion import verify_device_assertion
from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.runtime_status import mark_camera_offline, mark_camera_online
from app.api.plugins.rpi_cam.websocket.connection_manager import CameraConnectionManager
from app.api.plugins.rpi_cam.websocket.cross_worker_relay import run_relay_listener
from app.core.config import settings
from app.core.database import get_async_session
from app.core.logging import sanitize_log_value
from app.core.middleware.client_ip import extract_client_ip
from app.core.runtime import get_connection_redis, require_connection_camera_manager, require_connection_redis

if TYPE_CHECKING:
    from redis.asyncio import Redis

logger = logging.getLogger(__name__)

router = APIRouter()

_WS_DISCONNECT = "websocket.disconnect"
_WS_TEXT = "text"
_WS_BYTES = "bytes"

_HEARTBEAT_INTERVAL = 30.0
_HEARTBEAT_TIMEOUT = 90.0


@dataclass(slots=True)
class _PendingBinaryResponse:
    """JSON response header waiting for the following binary frame."""

    id: str
    header: dict


@dataclass(slots=True)
class _RelayWebSocketSession:
    """Own per-connection receive-loop state for one camera WebSocket."""

    camera_id: UUID4
    manager: CameraConnectionManager
    redis: Redis | None
    last_pong_at: float = field(default_factory=monotonic)
    pending_binary_response: _PendingBinaryResponse | None = None

    async def handle_text_frame(self, text: str) -> None:
        """Process a text frame and update any pending binary response state."""
        try:
            msg = json.loads(text)
        except json.JSONDecodeError:
            logger.warning("Camera %s sent invalid JSON, ignoring.", sanitize_log_value(self.camera_id))
            return

        if not isinstance(msg, dict):
            logger.warning("Camera %s sent non-object JSON, ignoring.", sanitize_log_value(self.camera_id))
            return

        msg_type = msg.get("type")
        if msg_type == RelayMessageType.PONG:
            self.last_pong_at = monotonic()
            if self.redis:
                await mark_camera_online(self.redis, self.camera_id)
        elif msg_type == RelayMessageType.PING:
            await self.manager.handle_ping(self.camera_id)
            if self.redis:
                await mark_camera_online(self.redis, self.camera_id)
        elif msg_type == RelayMessageType.RESPONSE:
            self._handle_response(msg)

    def handle_binary_frame(self, binary_data: bytes) -> None:
        """Process a binary frame and update any pending binary response state."""
        if self.pending_binary_response is not None:
            pending = self.pending_binary_response
            self.manager.resolve_json(pending.id, pending.header, binary_data)
            self.pending_binary_response = None
            return

        logger.warning("Camera %s sent unexpected binary frame, ignoring.", sanitize_log_value(self.camera_id))

    def _handle_response(self, msg: dict) -> None:
        """Resolve or defer a response frame depending on whether binary data follows."""
        try:
            envelope = RelayResponseEnvelope.model_validate(msg)
        except ValidationError:
            logger.warning("Camera %s sent malformed response envelope, ignoring.", sanitize_log_value(self.camera_id))
            return

        msg_id = envelope.id
        response = envelope.model_dump(mode="json")
        if envelope.has_binary:
            self.pending_binary_response = _PendingBinaryResponse(id=msg_id, header=response)
            return

        self.manager.resolve_json(msg_id, response, None)
        self.pending_binary_response = None


@router.websocket("/plugins/rpi-cam/ws/connect")
async def camera_websocket_connect(websocket: WebSocket, camera_id: UUID4) -> None:
    """Persistent WebSocket connection for an RPi camera relay tunnel."""
    if websocket.headers.get("origin") is not None:
        await websocket.close(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="Browser-origin WebSocket clients are not allowed.",
        )
        return

    if not await _authenticate(websocket, camera_id):
        return

    await websocket.accept()

    manager: CameraConnectionManager = require_connection_camera_manager(websocket)
    await manager.register(camera_id, websocket)

    redis = get_connection_redis(websocket)

    session = _RelayWebSocketSession(camera_id=camera_id, manager=manager, redis=redis)
    heartbeat = asyncio.create_task(
        _heartbeat_loop(websocket, session),
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
        await _receive_loop(websocket, session)
    except WebSocketDisconnect:
        # Client closed the socket; normal termination.
        pass
    except Exception:
        logger.exception("Unexpected error in WebSocket receive loop for camera %s", sanitize_log_value(camera_id))
    finally:
        tasks_to_cancel: list[asyncio.Task[object]] = [heartbeat]
        if relay_listener is not None:
            tasks_to_cancel.append(relay_listener)
        for task in tasks_to_cancel:
            task.cancel()
        await asyncio.gather(*tasks_to_cancel, return_exceptions=True)
        manager.unregister(camera_id)
        if redis:
            await mark_camera_offline(redis, camera_id)


async def _enforce_ws_auth_rate_limit(websocket: WebSocket, client_ip_bucket: str, camera_key: str) -> bool:
    """Apply shared Redis-backed rate limits to WebSocket authentication attempts."""
    try:
        limiter.hit_key(settings.rpi_cam_ws_auth_rate_limit, client_ip_bucket)
        limiter.hit_key(settings.rpi_cam_ws_auth_rate_limit, f"rpi-cam:ws-auth:camera:{camera_key}")
    except RateLimitExceededError:
        logger.warning(
            "WebSocket auth bucket %s for camera %s blocked by rate limit.",
            client_ip_bucket,
            sanitize_log_value(camera_key),
        )
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Too many failed attempts.")
        return False
    return True


async def _authenticate(websocket: WebSocket, camera_id: UUID4) -> bool:
    """Validate a short-lived signed camera device assertion."""
    client_ip = extract_client_ip(websocket.headers, websocket.client.host if websocket.client else "unknown")
    client_ip_bucket = rate_limit_bucket_key("rpi-cam:ws-auth:ip", client_ip)
    camera_key = str(camera_id)
    if not await _enforce_ws_auth_rate_limit(websocket, client_ip_bucket, camera_key):
        return False

    assertion = _extract_bearer_token(websocket)
    if not assertion:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing Authorization header.")
        return False

    camera = await _get_camera(camera_id)
    if camera is None or not camera.credential_is_active:
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
            "Camera %s assertion rejected from bucket %s: %s",
            sanitize_log_value(camera_id),
            client_ip_bucket,
            sanitize_log_value(exc),
        )
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication failed.")
        return False

    await mark_camera_online(redis, camera_id)
    logger.info(
        "Camera %s authenticated from bucket %s with key %s.",
        sanitize_log_value(camera_id),
        client_ip_bucket,
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


async def _heartbeat_loop(websocket: WebSocket, session: _RelayWebSocketSession) -> None:
    """Send periodic pings; disconnect if no pong arrives within the timeout."""
    while True:
        await asyncio.sleep(_HEARTBEAT_INTERVAL)
        elapsed = monotonic() - session.last_pong_at
        if elapsed > _HEARTBEAT_TIMEOUT:
            logger.warning(
                "Camera %s heartbeat timeout (%.0fs since last pong); closing.",
                sanitize_log_value(session.camera_id),
                elapsed,
            )
            with contextlib.suppress(Exception):
                await websocket.close(code=1001)
            return
        with contextlib.suppress(Exception):
            await websocket.send_text(json.dumps({"type": RelayMessageType.PING}))


async def _receive_loop(websocket: WebSocket, session: _RelayWebSocketSession) -> None:
    """Process incoming frames until the connection closes or a disconnect frame arrives."""
    while True:
        raw = await websocket.receive()

        if raw["type"] == _WS_DISCONNECT:
            break

        if _WS_TEXT in raw:
            text_data: str = raw[_WS_TEXT]
            if len(text_data.encode("utf-8")) > RELAY_WS_TEXT_FRAME_LIMIT_BYTES:
                logger.warning("Camera %s sent oversized text frame; closing.", sanitize_log_value(session.camera_id))
                await websocket.close(code=status.WS_1009_MESSAGE_TOO_BIG, reason="WebSocket frame too large.")
                return
            await session.handle_text_frame(text_data)
        elif _WS_BYTES in raw:
            session.handle_binary_frame(raw[_WS_BYTES])
