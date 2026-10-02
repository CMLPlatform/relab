"""Custom exceptions for file storage database models."""

from app.api.common.exceptions import NotFoundError, PayloadTooLargeError


class StorageFileNotFoundError(NotFoundError):
    """Custom error for file not found in storage."""

    def __init__(self, filename: str, details: str | None = None) -> None:
        super().__init__(message=f"File not found in storage: {filename}.", details=details)


class UploadTooLargeError(PayloadTooLargeError):
    """Raised when an uploaded file exceeds the configured size limit."""

    def __init__(self, *, upload_size_bytes: int, max_size_mb: int) -> None:
        super().__init__(
            message=f"File size too large: {upload_size_bytes / 1024 / 1024:.2f} MB. Maximum size: {max_size_mb} MB"
        )


class StorageBackendError(OSError):
    """Raised when a storage backend operation fails for a reason worth surfacing.

    Subclasses ``OSError`` so best-effort storage-cleanup call sites (written against
    the filesystem backend, where a real unlink failure is already an ``OSError``)
    transparently also catch S3/backend failures translated into this type, without
    needing botocore-specific imports outside file_storage.
    """
