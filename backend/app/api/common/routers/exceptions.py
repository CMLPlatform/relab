"""FastAPI exception handlers for API and framework exceptions."""

from typing import TYPE_CHECKING

from fastapi import FastAPI, Request, Response, status
from fastapi.responses import JSONResponse
from loguru import logger
from pydantic import ValidationError
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.common.exceptions import APIError

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

### Generic exception handlers ###


def create_exception_handler(
    default_status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
) -> Callable[[Request, Exception], Awaitable[JSONResponse]]:
    """Create a FastAPI exception handler. Can take in a default status code for built-in exceptions."""

    async def handler(_: Request, exc: Exception) -> JSONResponse:
        if isinstance(exc, APIError):
            status_code = exc.http_status_code
            detail = {"message": exc.message}
            if exc.details:
                detail["details"] = exc.details
            log_message = exc.log_message
        else:
            status_code = default_status_code
            detail = {"message": "Internal server error"} if status_code >= 500 else {"message": str(exc)}
            log_message = str(exc)

        # Log based on status code severity. Can be made more granular if needed.
        if status_code >= 500:
            logger.opt(exception=True).error(f"{exc.__class__.__name__}: {log_message}")
        elif status_code >= 400 and status_code != 404:
            logger.warning(f"{exc.__class__.__name__}: {log_message}")
        else:
            logger.info(f"{exc.__class__.__name__}: {log_message}")

        return JSONResponse(status_code=status_code, content={"detail": detail})

    return handler


def rate_limit_handler(request: Request, exc: Exception) -> Response:
    """Wrapper for the SlowAPI rate limit handler to ensure correct exception type is passed."""
    if not isinstance(exc, RateLimitExceeded):
        msg = "Rate limit handler called with wrong exception type"
        raise TypeError(msg)
    return _rate_limit_exceeded_handler(request, exc)


### Exception handler registration ###
def register_exception_handlers(app: FastAPI) -> None:
    """Register all exception handlers with the FastAPI app."""
    # Custom API exceptions
    app.add_exception_handler(APIError, create_exception_handler())

    # SlowAPI rate limiting
    app.add_exception_handler(RateLimitExceeded, rate_limit_handler)

    # Temporary compatibility handler for legacy domain validation paths.
    # Avoid catching RuntimeError broadly so programmer errors still surface normally.
    app.add_exception_handler(ValueError, create_exception_handler(status.HTTP_400_BAD_REQUEST))

    # NOTE: This is a validation error for internal logic, not for user input
    app.add_exception_handler(ValidationError, create_exception_handler(status.HTTP_500_INTERNAL_SERVER_ERROR))
