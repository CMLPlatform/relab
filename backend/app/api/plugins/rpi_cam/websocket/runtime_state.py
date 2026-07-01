"""Dependency-light runtime state for camera WebSocket relay services."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.api.plugins.rpi_cam.websocket.connection_manager import CameraConnectionManager

_manager: CameraConnectionManager | None = None


def get_connection_manager() -> CameraConnectionManager:
    """Return the global CameraConnectionManager initialized at startup."""
    if _manager is None:
        msg = "CameraConnectionManager is not initialized."
        raise RuntimeError(msg)
    return _manager


def set_connection_manager(manager: CameraConnectionManager | None) -> None:
    """Set or clear the process-local camera connection manager."""
    global _manager
    _manager = manager
