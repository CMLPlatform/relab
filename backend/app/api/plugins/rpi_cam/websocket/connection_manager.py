"""In-process registry of active RPi camera WebSocket connections."""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import uuid
from typing import TYPE_CHECKING

from pydantic import UUID4

from app.api.plugins.rpi_cam.websocket.protocol import MSG_PONG, build_command

if TYPE_CHECKING:
    from fastapi import WebSocket

logger = logging.getLogger(__name__)

# How long to wait for a command response before giving up.
DEFAULT_COMMAND_TIMEOUT = 30.0
# How long to wait for a response that includes a binary frame (e.g. image download).
BINARY_COMMAND_TIMEOUT = 60.0


class CameraConnectionManager:
    """Tracks WebSocket connections initiated by RPi cameras and routes commands to them."""

    def __init__(self) -> None:
        # camera_id → active WebSocket
        self._connections: dict[UUID4, WebSocket] = {}
        # msg_id → Future[tuple[dict, bytes | None]]
        self._pending: dict[str, asyncio.Future[tuple[dict, bytes | None]]] = {}

    # ── Connection lifecycle ──────────────────────────────────────────────────

    async def register(self, camera_id: UUID4, ws: WebSocket) -> None:
        """Register an active WebSocket connection for a camera.

        If a connection already exists for this camera (e.g. after reconnect), the
        old WebSocket is closed before the new one is registered so its receive loop
        exits cleanly instead of becoming an orphan.
        """
        existing = self._connections.get(camera_id)
        if existing is not None:
            logger.warning("Camera %s reconnected; closing stale connection.", camera_id)
            with contextlib.suppress(Exception):
                await existing.close(code=1001)  # 1001 = Going Away
        self._connections[camera_id] = ws
        logger.info("Camera %s connected via WebSocket", camera_id)

    def unregister(self, camera_id: UUID4) -> None:
        """Remove a camera's connection and cancel any pending futures."""
        self._connections.pop(camera_id, None)
        logger.info("Camera %s disconnected from WebSocket", camera_id)

    def is_connected(self, camera_id: UUID4) -> bool:
        """Return True if the camera has an active WebSocket connection."""
        return camera_id in self._connections

    # ── Command dispatch ──────────────────────────────────────────────────────

    async def send_command(
        self,
        camera_id: UUID4,
        method: str,
        path: str,
        params: dict | None = None,
        body: dict | None = None,
    ) -> tuple[dict, bytes | None]:
        """Send a command to the camera and await its response.

        Returns (json_response, binary_bytes). binary_bytes is set when the
        camera sends a binary frame after the JSON response (e.g. image data).
        Wrap calls with ``asyncio.timeout()`` to enforce a deadline.

        Raises:
            RuntimeError: Camera not connected.
        """
        ws = self._connections.get(camera_id)
        if ws is None:
            msg = f"Camera {camera_id} is not connected via WebSocket."
            raise RuntimeError(msg)

        msg_id = _new_msg_id()
        loop = asyncio.get_running_loop()
        future: asyncio.Future[tuple[dict, bytes | None]] = loop.create_future()
        self._pending[msg_id] = future

        try:
            payload = build_command(msg_id, method, path, params, body)
            await ws.send_text(payload)
            return await future
        finally:
            self._pending.pop(msg_id, None)

    # ── Called by the receive loop in router.py ───────────────────────────────

    def resolve_json(self, msg_id: str, data: dict, binary: bytes | None) -> None:
        """Resolve a pending future with the response from the camera."""
        future = self._pending.get(msg_id)
        if future and not future.done():
            future.set_result((data, binary))

    async def handle_ping(self, camera_id: UUID4) -> None:
        """Respond to a ping from the camera."""
        ws = self._connections.get(camera_id)
        if ws:
            await ws.send_text(json.dumps({"type": MSG_PONG}))


# ── Module-level singleton ────────────────────────────────────────────────────

_manager: CameraConnectionManager | None = None


def get_connection_manager() -> CameraConnectionManager:
    """Return the global CameraConnectionManager (must be initialised at startup)."""
    if _manager is None:
        msg = "CameraConnectionManager is not initialised."
        raise RuntimeError(msg)
    return _manager


def set_connection_manager(manager: CameraConnectionManager) -> None:
    """Set the global CameraConnectionManager (called during app startup)."""
    global _manager  # noqa: PLW0603
    _manager = manager


# ── Helpers ───────────────────────────────────────────────────────────────────


def _new_msg_id() -> str:
    return str(uuid.uuid4())
