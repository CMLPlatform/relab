"""FastAPI exception handlers to raise HTTP errors for common exceptions."""

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
        else:
            status_code = default_status_code
            detail = {"message": str(exc)}

        # Log based on status code severity. Can be made more granular if needed.
        if status_code >= 500:
            logger.opt(exception=True).error(f"{exc.__class__.__name__}: {exc!s}")
        elif status_code >= 400 and status_code != 404:
            logger.warning(f"{exc.__class__.__name__}: {exc!s}")
        else:
            logger.info(f"{exc.__class__.__name__}: {exc!s}")

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
    # TODO: When going public, any errors resulting from internal server logic
    # should be logged and not exposed to the client, instead returning a 500 error with a generic message.

    # Custom API exceptions
    app.add_exception_handler(APIError, create_exception_handler())

    # SlowAPI rate limiting
    app.add_exception_handler(RateLimitExceeded, rate_limit_handler)

    # Standard Python exceptions
    # TODO: These should be replaced with custom exceptions
    app.add_exception_handler(ValueError, create_exception_handler(status.HTTP_400_BAD_REQUEST))
    app.add_exception_handler(RuntimeError, create_exception_handler(status.HTTP_500_INTERNAL_SERVER_ERROR))

    # NOTE: This is a validation error for internal logic, not for user input
    app.add_exception_handler(ValidationError, create_exception_handler(status.HTTP_500_INTERNAL_SERVER_ERROR))
