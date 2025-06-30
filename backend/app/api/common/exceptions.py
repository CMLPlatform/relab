"""Base API exception."""

from fastapi import status


class APIError(Exception):
    """Base API exception."""

    # Default status code for API errors. Can be overridden in subclasses.
    http_status_code = status.HTTP_500_INTERNAL_SERVER_ERROR

    def __init__(self, message: str, details: str | None = None):
        self.message = message
        self.details = details
        super().__init__(message)
