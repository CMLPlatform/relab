"""FastAPI exception handlers for API and framework exceptions."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import FastAPI, Request, status
from loguru import logger
from pydantic import ValidationError

from app.api.auth.services.rate_limiter import RateLimitExceededError, rate_limit_exceeded_handler
from app.api.common.exceptions import APIError
from app.core.responses import build_problem_response

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from starlette.responses import Response

### Generic exception handlers ###


def create_exception_handler(
    default_status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
) -> Callable[[Request, Exception], Awaitable[Response]]:
    """Create a FastAPI exception handler. Can take in a default status code for built-in exceptions."""

    async def handler(request: Request, exc: Exception) -> Response:
        if isinstance(exc, APIError):
            status_code = exc.http_status_code
            detail = exc.message
            log_message = exc.log_message
            extra = {"code": exc.__class__.__name__}
            if exc.details:
                extra["errors"] = exc.details
        else:
            status_code = default_status_code
            detail = "Internal server error" if status_code >= 500 else str(exc)
            log_message = str(exc)
            extra = {"code": exc.__class__.__name__}

        # Log based on status code severity. Can be made more granular if needed.
        if status_code >= 500:
            logger.opt(exception=True).error(f"{exc.__class__.__name__}: {log_message}")
        elif status_code >= 400 and status_code != 404:
            logger.warning(f"{exc.__class__.__name__}: {log_message}")
        else:
            logger.info(f"{exc.__class__.__name__}: {log_message}")

        return build_problem_response(
            request=request,
            status_code=status_code,
            detail=detail,
            code=extra.pop("code"),
            extra=extra,
        )

    return handler


### Exception handler registration ###
def register_exception_handlers(app: FastAPI) -> None:
    """Register all exception handlers with the FastAPI app."""
    # Custom API exceptions
    app.add_exception_handler(APIError, create_exception_handler())

    # Rate limiting
    app.add_exception_handler(RateLimitExceededError, rate_limit_exceeded_handler)

    # NOTE: This is a validation error for internal logic, not for user input
    app.add_exception_handler(ValidationError, create_exception_handler(status.HTTP_500_INTERNAL_SERVER_ERROR))
