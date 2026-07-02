"""Typed runtime services stored on FastAPI connection state."""

from dataclasses import dataclass
from typing import TYPE_CHECKING, cast

from fastapi import FastAPI, Request

from app.api.common.exceptions import ServiceUnavailableError

if TYPE_CHECKING:
    import anyio
    from httpx import AsyncClient
    from redis.asyncio import Redis
    from starlette.requests import HTTPConnection

    from app.api.auth.services.common_password_checker import CommonPasswordChecker
    from app.api.auth.services.email_checker import EmailChecker
    from app.api.file_storage.services.manager import FileCleanupManager
    from app.api.plugins.rpi_cam.websocket.connection_manager import CameraConnectionManager

_REQUIRED_SERVICE_UNAVAILABLE = "Required service is temporarily unavailable."


@dataclass(slots=True)
class AppServices:
    """Typed container for long-lived runtime services."""

    redis: Redis | None = None
    email_checker: EmailChecker | None = None
    common_password_checker: CommonPasswordChecker | None = None
    camera_connection_manager: CameraConnectionManager | None = None
    file_cleanup_manager: FileCleanupManager | None = None
    http_client: AsyncClient | None = None
    image_resize_limiter: anyio.CapacityLimiter | None = None
    storage_ready: bool = False
    telemetry_enabled: bool = False


def get_connection_services(connection: HTTPConnection) -> AppServices:
    """Return the typed runtime services container from any Starlette connection."""
    return get_app_services(cast("FastAPI", connection.app))


def get_app_services(app: FastAPI) -> AppServices:
    """Return the typed runtime services container from app state."""
    services = getattr(app.state, "services", None)
    if not isinstance(services, AppServices):
        services = AppServices()
        app.state.services = services
    return services


def get_request_services(request: Request) -> AppServices:
    """Return the typed runtime services container from a request."""
    return get_connection_services(request)


def get_connection_redis(connection: HTTPConnection) -> Redis | None:
    """Return the shared Redis client for a request or websocket."""
    return get_connection_services(connection).redis


def get_connection_camera_manager(connection: HTTPConnection) -> CameraConnectionManager | None:
    """Return the shared camera connection manager for a request or websocket."""
    return get_connection_services(connection).camera_connection_manager


def require_connection_camera_manager(connection: HTTPConnection) -> CameraConnectionManager:
    """Return the shared camera manager, raising when runtime init is incomplete."""
    manager = get_connection_camera_manager(connection)
    if manager is None:
        msg = "Camera connection manager is not initialized"
        raise RuntimeError(msg)
    return manager


def require_redis(redis_client: Redis | None) -> Redis:
    """Raise an HTTP-style error if Redis is unavailable."""
    if redis_client is None:
        raise ServiceUnavailableError(
            _REQUIRED_SERVICE_UNAVAILABLE,
            log_message="Redis is required for this operation.",
        )
    return redis_client


def require_connection_redis(connection: HTTPConnection) -> Redis:
    """Return the shared Redis client, raising when runtime init is incomplete."""
    return require_redis(get_connection_redis(connection))


def reset_app_services(app: FastAPI) -> AppServices:
    """Reset runtime services to an empty container."""
    services = AppServices()
    app.state.services = services
    return services
