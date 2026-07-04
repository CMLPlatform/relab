"""Storage backend resolution helpers."""

from functools import lru_cache
from typing import TYPE_CHECKING

from app.api.file_storage.models.storage_core import BaseStorage
from app.api.file_storage.models.storage_filesystem import FileSystemStorage
from app.api.file_storage.models.storage_s3 import S3Storage
from app.core.config import StorageBackend, settings

if TYPE_CHECKING:
    from pathlib import Path


@lru_cache(maxsize=8)
def _build_s3_storage(
    prefix: str,
    bucket: str,
    region: str | None,
    access_key_id: str | None,
    secret_access_key: str | None,
    endpoint_url: str | None,
    base_url: str | None,
) -> S3Storage:
    """Build (and reuse) one S3 backend per config.

    Keying the cache on the config values keeps it correct when tests
    override settings at runtime.
    """
    return S3Storage(
        bucket=bucket,
        prefix=prefix,
        region=region,
        access_key_id=access_key_id,
        secret_access_key=secret_access_key,
        endpoint_url=endpoint_url,
        base_url=base_url,
    )


def _get_storage(prefix: str, filesystem_path: Path) -> BaseStorage:
    """Return the configured storage backend for one media kind."""
    if settings.storage_backend == StorageBackend.S3:
        return _build_s3_storage(
            prefix,
            settings.s3_bucket,
            settings.s3_region,
            settings.s3_access_key_id.get_secret_value() or None,
            settings.s3_secret_access_key.get_secret_value() or None,
            settings.s3_endpoint_url,
            settings.s3_base_url,
        )
    # FileSystemStorage is cheap to build; resolving per call keeps it in sync
    # with the settings.*_storage_path temp dirs tests repoint at runtime.
    return FileSystemStorage(path=str(filesystem_path))


def _get_file_storage() -> BaseStorage:
    """Return the configured storage backend for generic files."""
    return _get_storage(settings.s3_file_prefix, settings.file_storage_path)


def _get_image_storage() -> BaseStorage:
    """Return the configured storage backend for image files."""
    return _get_storage(settings.s3_image_prefix, settings.image_storage_path)
