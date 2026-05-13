"""Dependency-light runtime state for camera WebSocket relay services."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from redis.asyncio import Redis

    from app.api.plugins.rpi_cam.websocket.connection_manager import CameraConnectionManager

_manager_state: dict[str, CameraConnectionManager | None] = {"manager": None}
_blocking_redis_state: dict[str, Redis | None] = {"client": None}


def get_connection_manager() -> CameraConnectionManager:
    """Return the global CameraConnectionManager initialized at startup."""
    manager = _manager_state["manager"]
    if manager is None:
        msg = "CameraConnectionManager is not initialized."
        raise RuntimeError(msg)
    return manager


def set_connection_manager(manager: CameraConnectionManager | None) -> None:
    """Set or clear the process-local camera connection manager."""
    _manager_state["manager"] = manager


def get_blocking_redis() -> Redis | None:
    """Return the blocking Redis client, or None if unavailable."""
    return _blocking_redis_state["client"]


def set_blocking_redis(client: Redis | None) -> None:
    """Set or clear the process-local blocking Redis relay client."""
    _blocking_redis_state["client"] = client
