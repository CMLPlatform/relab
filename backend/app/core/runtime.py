"""Typed runtime services stored on FastAPI connection state."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, cast

from fastapi import FastAPI, Request

if TYPE_CHECKING:
    import anyio
    from httpx import AsyncClient
    from redis.asyncio import Redis
    from starlette.requests import HTTPConnection

    from app.api.auth.services.email_checker import EmailChecker
    from app.api.file_storage.services.manager import FileCleanupManager
    from app.api.plugins.rpi_cam.websocket.connection_manager import CameraConnectionManager


@dataclass(slots=True)
class AppServices:
    """Typed container for long-lived runtime services."""

    redis: Redis | None = None
    blocking_redis: Redis | None = None
    email_checker: EmailChecker | None = None
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


def require_connection_services(connection: HTTPConnection) -> AppServices:
    """Return runtime services for a connection.

    This helper documents intent at call sites that expect the container to be
    present as part of normal application startup.
    """
    return get_connection_services(connection)


def get_connection_redis(connection: HTTPConnection) -> Redis | None:
    """Return the shared Redis client for a request or websocket."""
    return get_connection_services(connection).redis


def get_connection_blocking_redis(connection: HTTPConnection) -> Redis | None:
    """Return the shared blocking Redis client for a request or websocket."""
    return get_connection_services(connection).blocking_redis


def get_connection_http_client(connection: HTTPConnection) -> AsyncClient | None:
    """Return the shared outbound HTTP client for a request or websocket."""
    return get_connection_services(connection).http_client


def get_connection_camera_manager(connection: HTTPConnection) -> CameraConnectionManager | None:
    """Return the shared camera connection manager for a request or websocket."""
    return get_connection_services(connection).camera_connection_manager


def get_connection_image_resize_limiter(connection: HTTPConnection) -> anyio.CapacityLimiter | None:
    """Return the shared image resize limiter for a request or websocket."""
    return get_connection_services(connection).image_resize_limiter


def get_request_email_checker(request: Request) -> EmailChecker | None:
    """Return the shared disposable-email checker for a request."""
    return get_request_services(request).email_checker


def get_connection_file_cleanup_manager(connection: HTTPConnection) -> FileCleanupManager | None:
    """Return the shared file cleanup manager for a request or websocket."""
    return get_connection_services(connection).file_cleanup_manager


def require_connection_camera_manager(connection: HTTPConnection) -> CameraConnectionManager:
    """Return the shared camera manager, raising when runtime init is incomplete."""
    manager = get_connection_camera_manager(connection)
    if manager is None:
        msg = "Camera connection manager is not initialized"
        raise RuntimeError(msg)
    return manager


def require_connection_redis(connection: HTTPConnection) -> Redis:
    """Return the shared Redis client, raising when runtime init is incomplete."""
    redis = get_connection_redis(connection)
    if redis is None:
        msg = "Redis is not initialized"
        raise RuntimeError(msg)
    return redis


def require_connection_http_client(connection: HTTPConnection) -> AsyncClient:
    """Return the shared outbound HTTP client, raising when runtime init is incomplete."""
    http_client = get_connection_http_client(connection)
    if http_client is None:
        msg = "HTTP client is not initialized"
        raise RuntimeError(msg)
    return http_client


def sync_legacy_state(app: FastAPI, services: AppServices) -> None:
    """Mirror typed services onto legacy ``app.state`` attributes during migration."""
    app.state.redis = services.redis
    app.state.blocking_redis = services.blocking_redis
    app.state.email_checker = services.email_checker
    app.state.camera_connection_manager = services.camera_connection_manager
    app.state.file_cleanup_manager = services.file_cleanup_manager
    app.state.http_client = services.http_client
    app.state.image_resize_limiter = services.image_resize_limiter
    app.state.storage_ready = services.storage_ready
    app.state.telemetry_enabled = services.telemetry_enabled


def reset_app_services(app: FastAPI) -> AppServices:
    """Reset runtime services to an empty container."""
    services = AppServices()
    app.state.services = services
    sync_legacy_state(app, services)
    return services
