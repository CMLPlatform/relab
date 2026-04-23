"""Base API exception types."""

from fastapi import status


class APIError(Exception):
    """Base API exception."""

    # Default status code for API errors. Can be overridden in subclasses.
    http_status_code = status.HTTP_500_INTERNAL_SERVER_ERROR

    def __init__(self, message: str, details: str | None = None, *, log_message: str | None = None):
        self.message = message
        self.details = details
        self.log_message = log_message or message
        super().__init__(message)


class BadRequestError(APIError):
    """Exception raised when the client supplied invalid data."""

    http_status_code = status.HTTP_400_BAD_REQUEST


class UnauthorizedError(APIError):
    """Exception raised when authentication is required or invalid."""

    http_status_code = status.HTTP_401_UNAUTHORIZED


class ForbiddenError(APIError):
    """Exception raised when the current user is not allowed to perform an action."""

    http_status_code = status.HTTP_403_FORBIDDEN


class NotFoundError(APIError):
    """Exception raised when a requested resource does not exist."""

    http_status_code = status.HTTP_404_NOT_FOUND


class ConflictError(APIError):
    """Exception raised when the requested change conflicts with current state."""

    http_status_code = status.HTTP_409_CONFLICT


class FailedDependencyError(APIError):
    """Exception raised when an upstream or dependent system returns unusable data."""

    http_status_code = status.HTTP_424_FAILED_DEPENDENCY


class PayloadTooLargeError(APIError):
    """Exception raised when a request payload exceeds configured limits."""

    http_status_code = status.HTTP_413_CONTENT_TOO_LARGE


class ServiceUnavailableError(APIError):
    """Exception raised when a required service is temporarily unavailable."""

    http_status_code = status.HTTP_503_SERVICE_UNAVAILABLE


class InternalServerError(APIError):
    """Exception raised for unexpected internal application errors."""

    http_status_code = status.HTTP_500_INTERNAL_SERVER_ERROR

    def __init__(
        self,
        message: str = "Internal server error",
        details: str | None = None,
        *,
        log_message: str | None = None,
    ) -> None:
        super().__init__(message=message, details=details, log_message=log_message)
