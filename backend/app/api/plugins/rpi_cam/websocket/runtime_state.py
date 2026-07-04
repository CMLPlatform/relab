"""Dependency-light runtime state for camera WebSocket relay services."""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from starlette.requests import HTTPConnection

    from app.api.plugins.rpi_cam.websocket.connection_manager import CameraConnectionManager

_manager: CameraConnectionManager | None = None


def require_connection_camera_manager(connection: HTTPConnection) -> CameraConnectionManager:
    """Return the app's camera manager, raising when runtime init is incomplete."""
    from app.core.runtime import get_connection_services  # noqa: PLC0415 # keep this module import-light

    manager = get_connection_services(connection).camera_connection_manager
    if manager is None:
        msg = "Camera connection manager is not initialized"
        raise RuntimeError(msg)
    return manager


def get_connection_manager() -> CameraConnectionManager:
    """Return the global CameraConnectionManager initialized at startup."""
    if _manager is None:
        msg = "CameraConnectionManager is not initialized."
        raise RuntimeError(msg)
    return _manager


def set_connection_manager(manager: CameraConnectionManager | None) -> None:
    """Set or clear the process-local camera connection manager."""
    global _manager  # noqa: PLW0603 # process-local singleton set once at startup
    _manager = manager
