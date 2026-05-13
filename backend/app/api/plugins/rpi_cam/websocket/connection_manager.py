"""In-process registry of active RPi camera WebSocket connections."""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import uuid
from typing import TYPE_CHECKING, Protocol, cast

import relab_rpi_cam_models as relay_models
from pydantic import UUID4
from relab_rpi_cam_models import RelayMessageType

if TYPE_CHECKING:
    from fastapi import WebSocket

    class _RelayCommand(Protocol):
        def model_dump_json(self) -> str: ...

    class _RelayModels(Protocol):
        def build_relay_command(
            self,
            msg_id: str,
            method: str,
            path: str,
            params: dict | None = None,
            body: dict | None = None,
            headers: dict[str, str] | None = None,
        ) -> _RelayCommand: ...


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
        headers: dict[str, str] | None = None,
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
            payload = (
                cast("_RelayModels", relay_models)
                .build_relay_command(msg_id, method, path, params, body, headers)
                .model_dump_json()
            )
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
            await ws.send_text(json.dumps({"type": RelayMessageType.PONG}))


# ── Helpers ───────────────────────────────────────────────────────────────────


def _new_msg_id() -> str:
    return str(uuid.uuid4())
