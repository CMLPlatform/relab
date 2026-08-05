"""Typed runtime services stored on FastAPI connection state."""

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, cast

from fastapi import FastAPI, Request

if TYPE_CHECKING:
    from httpx import AsyncClient
    from redis.asyncio import Redis
    from starlette.requests import HTTPConnection

_REQUIRED_SERVICE_UNAVAILABLE = "Required service is temporarily unavailable."


class RequiredServiceUnavailableError(RuntimeError):
    """Raised when a core runtime service a request needs was never initialized.

    Core owns this error; the API layer maps it to a 503 response.
    """

    def __init__(self, message: str = _REQUIRED_SERVICE_UNAVAILABLE, *, log_message: str | None = None) -> None:
        self.message = message
        self.log_message = log_message or message
        super().__init__(message)


@dataclass(slots=True)
class AppServices:
    """Container for long-lived runtime services.

    Core owns only the infrastructure services it creates itself. Domain-owned
    services live in ``extras`` under a domain-namespaced key, with typed
    accessors provided by the owning domain — core stays free of domain imports.
    """

    redis: Redis | None = None
    http_client: AsyncClient | None = None
    extras: dict[str, object] = field(default_factory=dict)


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


def require_redis(redis_client: Redis | None) -> Redis:
    """Raise an HTTP-style error if Redis is unavailable."""
    if redis_client is None:
        raise RequiredServiceUnavailableError(
            log_message="Redis is required for this operation.",
        )
    return redis_client


def require_connection_redis(connection: HTTPConnection) -> Redis:
    """Return the shared Redis client, raising when runtime init is incomplete."""
    return require_redis(get_connection_services(connection).redis)


def reset_app_services(app: FastAPI) -> AppServices:
    """Reset runtime services to an empty container."""
    services = AppServices()
    app.state.services = services
    return services
