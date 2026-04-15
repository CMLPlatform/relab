"""Storage backend resolution helpers."""

from __future__ import annotations

from app.api.file_storage.models.storage_core import BaseStorage
from app.api.file_storage.models.storage_filesystem import FileSystemStorage
from app.api.file_storage.models.storage_s3 import S3Storage
from app.core.config import StorageBackend, settings


def _get_file_storage() -> BaseStorage:
    """Return the configured storage backend for generic files."""
    if settings.storage_backend == StorageBackend.S3:
        return S3Storage(
            bucket=settings.s3_bucket,
            prefix=settings.s3_file_prefix,
            region=settings.s3_region,
            access_key_id=settings.s3_access_key_id.get_secret_value() or None,
            secret_access_key=settings.s3_secret_access_key.get_secret_value() or None,
            endpoint_url=settings.s3_endpoint_url,
            base_url=settings.s3_base_url,
        )
    return FileSystemStorage(path=str(settings.file_storage_path))


def _get_image_storage() -> BaseStorage:
    """Return the configured storage backend for image files."""
    if settings.storage_backend == StorageBackend.S3:
        return S3Storage(
            bucket=settings.s3_bucket,
            prefix=settings.s3_image_prefix,
            region=settings.s3_region,
            access_key_id=settings.s3_access_key_id.get_secret_value() or None,
            secret_access_key=settings.s3_secret_access_key.get_secret_value() or None,
            endpoint_url=settings.s3_endpoint_url,
            base_url=settings.s3_base_url,
        )
    return FileSystemStorage(path=str(settings.image_storage_path))
