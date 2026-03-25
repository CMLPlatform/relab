"""Common routers dependencies."""

from typing import Annotated

from fastapi import Depends, Request
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.common.exceptions import ServiceUnavailableError
from app.core.database import get_async_session

# FastAPI dependency for getting an asynchronous database session
AsyncSessionDep = Annotated[AsyncSession, Depends(get_async_session)]


def get_external_http_client(request: Request) -> AsyncClient:
    """Return the shared outbound HTTP client from application state."""
    http_client = getattr(request.app.state, "http_client", None)
    if http_client is None:
        msg = "Outbound HTTP client is not available."
        raise ServiceUnavailableError(msg)
    return http_client


ExternalHTTPClientDep = Annotated[AsyncClient, Depends(get_external_http_client)]
