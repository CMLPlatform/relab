"""FastAPI exception handlers for API and framework exceptions."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from fastapi import FastAPI, Request, status
from pydantic import ValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.auth.services.rate_limiter import RateLimitExceededError, rate_limit_exceeded_handler
from app.api.common.exceptions import APIError
from app.core.responses import build_problem_response

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from starlette.responses import Response

### Generic exception handlers ###

logger = logging.getLogger(__name__)
_INTERNAL_SERVER_ERROR_DETAIL = "Internal server error"


def create_exception_handler(
    default_status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
) -> Callable[[Request, Exception], Awaitable[Response]]:
    """Create a FastAPI exception handler. Can take in a default status code for built-in exceptions."""

    async def handler(request: Request, exc: Exception) -> Response:
        status_code, detail, log_message, code, extra = _response_parts(exc, default_status_code)

        # Log based on status code severity. Can be made more granular if needed.
        if status_code >= 500:
            logger.error(
                "%s: %s",
                exc.__class__.__name__,
                log_message,
                exc_info=(type(exc), exc, exc.__traceback__),
            )  # FastAPI gives handlers the exception object outside an except block.
        elif status_code >= 400 and status_code != 404:
            logger.warning("%s: %s", exc.__class__.__name__, log_message)
        else:
            logger.info("%s: %s", exc.__class__.__name__, log_message)

        return build_problem_response(
            request=request,
            status_code=status_code,
            detail=detail,
            code=code,
            extra=extra,
            headers=getattr(exc, "headers", None),
        )

    return handler


def _response_parts(
    exc: Exception,
    default_status_code: int,
) -> tuple[int, str, str, str, dict[str, object]]:
    """Return status, client detail, log message, code, and extra response fields."""
    if isinstance(exc, APIError):
        return _api_error_parts(exc)
    if isinstance(exc, StarletteHTTPException):
        return (
            exc.status_code,
            _safe_http_exception_detail(exc),
            str(exc.detail),
            exc.__class__.__name__,
            {},
        )

    detail = _INTERNAL_SERVER_ERROR_DETAIL if default_status_code >= 500 else str(exc)
    return default_status_code, detail, str(exc), exc.__class__.__name__, {}


def _api_error_parts(exc: APIError) -> tuple[int, str, str, str, dict[str, object]]:
    extra: dict[str, object] = {}
    if exc.details and exc.http_status_code < status.HTTP_500_INTERNAL_SERVER_ERROR:
        extra["errors"] = exc.details

    return exc.http_status_code, exc.message, exc.log_message, exc.__class__.__name__, extra


def _safe_http_exception_detail(exc: StarletteHTTPException) -> str:
    """Return a client-safe detail string for framework HTTP exceptions."""
    if exc.status_code >= status.HTTP_500_INTERNAL_SERVER_ERROR:
        return _INTERNAL_SERVER_ERROR_DETAIL
    if isinstance(exc.detail, str):
        return exc.detail
    return str(exc.detail)


### Exception handler registration ###
def register_exception_handlers(app: FastAPI) -> None:
    """Register all exception handlers with the FastAPI app."""
    # Custom API exceptions
    app.add_exception_handler(APIError, create_exception_handler())

    # Framework HTTP exceptions
    app.add_exception_handler(StarletteHTTPException, create_exception_handler())

    # Rate limiting
    app.add_exception_handler(RateLimitExceededError, rate_limit_exceeded_handler)

    # NOTE: This is a validation error for internal logic, not for user input
    app.add_exception_handler(ValidationError, create_exception_handler(status.HTTP_500_INTERNAL_SERVER_ERROR))

    # Unexpected errors
    app.add_exception_handler(Exception, create_exception_handler(status.HTTP_500_INTERNAL_SERVER_ERROR))
