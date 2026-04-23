"""Custom exceptions for file storage database models."""

from app.api.common.exceptions import NotFoundError, PayloadTooLargeError
from app.api.common.models.base import get_model_label
from app.api.common.models.custom_types import IDT, MT


class FastAPIStorageFileNotFoundError(NotFoundError):
    """Custom error for file not found in storage."""

    def __init__(self, filename: str, details: str | None = None) -> None:
        super().__init__(message=f"File not found in storage: {filename}.", details=details)


class ModelFileNotFoundError(NotFoundError):
    """Exception raised when a file of a database model is not found in the local storage."""

    def __init__(
        self, model_type: type[MT] | None = None, model_id: IDT | None = None, details: str | None = None
    ) -> None:
        super().__init__(
            message=f"File for {get_model_label(model_type)}{f'with id {model_id}'} not found.",
            details=details,
        )


class ParentStorageOwnershipError(NotFoundError):
    """Raised when a stored item does not belong to the requested parent resource."""

    def __init__(self, storage_model: type[MT], storage_id: IDT, parent_model: type[MT], parent_id: IDT) -> None:
        storage_model_name = get_model_label(storage_model)
        parent_model_name = get_model_label(parent_model)
        super().__init__(
            message=f"{storage_model_name} with id {storage_id} not found for {parent_model_name} {parent_id}"
        )


class UploadTooLargeError(PayloadTooLargeError):
    """Raised when an uploaded file exceeds the configured size limit."""

    def __init__(self, *, file_size_bytes: int, max_size_mb: int) -> None:
        super().__init__(
            message=f"File size too large: {file_size_bytes / 1024 / 1024:.2f} MB. Maximum size: {max_size_mb} MB"
        )
