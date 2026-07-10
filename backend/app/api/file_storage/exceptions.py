"""Custom exceptions for file storage database models."""

from typing import TYPE_CHECKING

from app.api.common.exceptions import NotFoundError, PayloadTooLargeError
from app.api.common.models.base import get_model_label

if TYPE_CHECKING:
    from uuid import UUID

    from app.api.common.models.base import Base


class FastAPIStorageFileNotFoundError(NotFoundError):
    """Custom error for file not found in storage."""

    def __init__(self, filename: str, details: str | None = None) -> None:
        super().__init__(message=f"File not found in storage: {filename}.", details=details)


class ModelFileNotFoundError(NotFoundError):
    """Exception raised when a file of a database model is not found in the local storage."""

    def __init__(
        self, model_type: type[Base] | None = None, model_id: int | UUID | None = None, details: str | None = None
    ) -> None:
        super().__init__(
            message=f"File for {get_model_label(model_type)}{f'with id {model_id}'} not found.",
            details=details,
        )


class UploadTooLargeError(PayloadTooLargeError):
    """Raised when an uploaded file exceeds the configured size limit."""

    def __init__(self, *, upload_size_bytes: int, max_size_mb: int) -> None:
        super().__init__(
            message=f"File size too large: {upload_size_bytes / 1024 / 1024:.2f} MB. Maximum size: {max_size_mb} MB"
        )
