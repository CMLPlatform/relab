"""FastAPI exception handlers to raise HTTP errors for common exceptions."""

import logging
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.api.common.exceptions import APIError

### Generic exception handlers ###

logger = logging.getLogger()


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

        # TODO: Add traceback location to log message (perhaps easier by  just using loguru)
        # Log based on status code severity. Can be made more granular if needed.
        if status_code >= 500:
            logger.error("%s: %s", exc.__class__.__name__, str(exc), exc_info=exc)
        elif status_code >= 400 and status_code != 404:
            logger.warning("%s: %s", exc.__class__.__name__, str(exc))
        else:
            logger.info("%s: %s", exc.__class__.__name__, str(exc))

        return JSONResponse(status_code=status_code, content={"detail": detail})

    return handler


### Exception handler registration ###
def register_exception_handlers(app: FastAPI) -> None:
    """Register all exception handlers with the FastAPI app."""
    # TODO: When going public, any errors resulting from internal server logic
    # should be logged and not exposed to the client, instead returning a 500 error with a generic message.

    # Custom API exceptions
    app.add_exception_handler(APIError, create_exception_handler())

    # Standard Python exceptions
    # TODO: These should be replaced with custom exceptions
    app.add_exception_handler(ValueError, create_exception_handler(status.HTTP_400_BAD_REQUEST))
    app.add_exception_handler(RuntimeError, create_exception_handler(status.HTTP_500_INTERNAL_SERVER_ERROR))

    # NOTE: This is a validation error for internal logic, not for user input
    app.add_exception_handler(ValidationError, create_exception_handler(status.HTTP_500_INTERNAL_SERVER_ERROR))
