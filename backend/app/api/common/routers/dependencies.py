"""Common routers dependencies."""

from typing import Annotated

from fastapi import BackgroundTasks, Depends, Request
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.common.exceptions import ServiceUnavailableError
from app.core.database import get_async_session
from app.core.runtime import get_request_services

# FastAPI dependency for getting an asynchronous database session
AsyncSessionDep = Annotated[AsyncSession, Depends(get_async_session)]


async def get_external_http_client(request: Request) -> AsyncClient:
    """Return the shared outbound HTTP client from application state."""
    # Async on purpose: this only reads request state, and a sync dependency would
    # make FastAPI hop to a threadpool for it on every request that resolves it.
    http_client = get_request_services(request).http_client
    if http_client is None:
        msg = "Outbound HTTP client is not available."
        raise ServiceUnavailableError(msg)
    return http_client


ExternalHTTPClientDep = Annotated[AsyncClient, Depends(get_external_http_client)]


async def attach_background_tasks(request: Request, background_tasks: BackgroundTasks) -> None:
    """Publish the request's BackgroundTasks on ``request.state``.

    Handlers take ``BackgroundTasks`` as a parameter, but code reached *through* a
    handler often cannot: the fastapi-users verify and reset routers are built by the
    library, and the ``UserManager`` hooks they call are handed only a ``Request``.
    Declared as a router-level dependency, this gives that code a way to defer work
    without every caller re-plumbing the parameter through.
    """
    request.state.background_tasks = background_tasks


def background_tasks_from(request: Request | None) -> BackgroundTasks | None:
    """Read back what ``attach_background_tasks`` published, if anything.

    None whenever the caller is not inside a request that declared the dependency —
    a CLI, a seed script, a test calling a service directly. Every consumer treats
    that as "send it inline", so the fallback is a slower success, not a failure.
    """
    return getattr(getattr(request, "state", None), "background_tasks", None)
