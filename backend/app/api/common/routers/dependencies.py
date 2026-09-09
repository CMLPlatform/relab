"""Common routers dependencies."""

from typing import Annotated

from fastapi import Depends, Request
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
