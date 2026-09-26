"""Unit tests for product media storage cleanup helpers."""

import logging
from typing import TYPE_CHECKING, cast
from unittest.mock import MagicMock

from app.api.data_collection.crud.storage import cleanup_product_media_storage
from app.api.file_storage.exceptions import StorageBackendError
from app.api.file_storage.models import File, Image

if TYPE_CHECKING:
    import pytest

_THROTTLED_MESSAGE = "Failed to delete S3 object 'photo.jpg': ThrottlingException"


async def test_cleanup_product_media_storage_survives_storage_backend_error(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A translated S3/backend failure (not a plain OSError) must not raise past cleanup.

    ``StorageBackendError`` subclasses ``OSError`` precisely so this best-effort cleanup
    (written against the filesystem backend, where a real unlink failure is an ``OSError``)
    also tolerates a botocore-shaped backend failure translated by ``S3Storage.delete``,
    rather than turning post-commit cleanup into a request-failing 500.
    """
    mock_item = MagicMock(spec=File)
    mock_item.file.name = "photo.jpg"
    item = cast("File", mock_item)

    async def delete_from_storage(_item: File | Image) -> None:
        raise StorageBackendError(_THROTTLED_MESSAGE)

    with caplog.at_level(logging.WARNING):
        await cleanup_product_media_storage([(item, delete_from_storage)])

    assert "cleanup failed" in caplog.text.lower()
