"""Route audience metadata used for OpenAPI schema filtering."""

from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING, Any

from fastapi import APIRouter
from fastapi.routing import APIRoute

if TYPE_CHECKING:
    from collections.abc import Callable

    from fastapi.types import DecoratedCallable

OPENAPI_AUDIENCE_EXTENSION = "x-audience"


class RouteAudience(StrEnum):
    """Audience groups used to derive filtered OpenAPI schemas."""

    PUBLIC = "public"
    APP = "app"
    ADMIN = "admin"
    DEVICE = "device"
    OPERATIONS = "operations"
    WEB = "web"
    CANONICAL_ONLY = "canonical-only"


def audience_extra(*audiences: RouteAudience | str) -> dict[str, list[str]]:
    """Build OpenAPI metadata for route audience filtering."""
    return {OPENAPI_AUDIENCE_EXTENSION: [str(audience) for audience in audiences]}


def merge_audience_extra(
    existing_extra: dict[str, Any] | None,
    *audiences: RouteAudience | str,
) -> dict[str, Any]:
    """Merge audience metadata into an existing OpenAPI extra mapping."""
    merged = dict(existing_extra or {})
    existing_audiences = _coerce_audiences(merged.get(OPENAPI_AUDIENCE_EXTENSION))
    next_audiences = [str(audience) for audience in audiences]
    merged[OPENAPI_AUDIENCE_EXTENSION] = [*existing_audiences, *next_audiences]
    return merged


def route_audiences(route: APIRoute) -> tuple[str, ...]:
    """Return explicit audiences attached to a route."""
    if route.openapi_extra is None:
        return ()
    return tuple(_coerce_audiences(route.openapi_extra.get(OPENAPI_AUDIENCE_EXTENSION)))


def _coerce_audiences(value: object) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list) and all(isinstance(item, str) for item in value):
        return [item for item in value if isinstance(item, str)]
    if isinstance(value, tuple) and all(isinstance(item, str) for item in value):
        return [item for item in value if isinstance(item, str)]
    return []


class AudienceAPIRouter(APIRouter):
    """Router that tags all operations with audience metadata."""

    audiences: tuple[RouteAudience | str, ...]

    def __init__(self, *args: Any, audiences: tuple[RouteAudience | str, ...], **kwargs: Any) -> None:  # noqa: ANN401 - mirrors APIRouter's flexible constructor
        self.audiences = audiences
        super().__init__(*args, **kwargs)

    def api_route(self, path: str, *args: Any, **kwargs: Any) -> Callable[[DecoratedCallable], DecoratedCallable]:  # noqa: ANN401 - mirrors APIRouter's flexible signature
        """Attach this router's audiences to every operation."""
        kwargs["openapi_extra"] = merge_audience_extra(kwargs.get("openapi_extra"), *self.audiences)
        return super().api_route(path, *args, **kwargs)


class PublicAPIRouter(AudienceAPIRouter):
    """Router for public app-facing API routes."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:  # noqa: ANN401 - mirrors APIRouter's flexible constructor
        super().__init__(*args, audiences=(RouteAudience.PUBLIC, RouteAudience.APP), **kwargs)


class AdminAPIRouter(AudienceAPIRouter):
    """Router for superuser/admin API routes."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:  # noqa: ANN401 - mirrors APIRouter's flexible constructor
        super().__init__(*args, audiences=(RouteAudience.ADMIN,), **kwargs)


class DeviceAPIRouter(AudienceAPIRouter):
    """Router for device-originated API routes."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:  # noqa: ANN401 - mirrors APIRouter's flexible constructor
        super().__init__(*args, audiences=(RouteAudience.DEVICE,), **kwargs)
