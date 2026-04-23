"""SQLAlchemy column types backed by configured storage backends."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy.engine.interfaces import Dialect
from sqlalchemy.types import TypeDecorator, Unicode

from app.api.file_storage.models.storage_core import BaseStorage, StorageFile, StorageImage
from app.api.file_storage.models.storage_resolver import _get_file_storage, _get_image_storage
from app.core.images import validate_image_file

if TYPE_CHECKING:
    from typing import BinaryIO

    from app.api.file_storage.models.storage_core import UploadValue


class _BaseStorageType(TypeDecorator):
    """Shared SQLAlchemy type behavior for storage-backed columns."""

    impl = Unicode
    cache_ok = True

    def __init__(self, storage: BaseStorage, *args: object, **kwargs: object) -> None:
        self.storage = storage
        super().__init__(*args, **kwargs)

    def process_bind_param(self, value: UploadValue | None, dialect: Dialect) -> str | None:
        """Persist an uploaded value and return the stored file name."""
        del dialect
        if value is None:
            return value
        if isinstance(value, str):
            return self.storage.get_name(value)

        file_obj = value.file
        if len(file_obj.read(1)) != 1:
            return None

        file_obj.seek(0)
        try:
            return self._process_upload_value(value, file_obj)
        finally:
            file_obj.close()

    def _process_upload_value(self, value: UploadValue, file_obj: BinaryIO) -> str:
        """Persist an uploaded file-like value and return the stored name."""
        raise NotImplementedError


class FileType(_BaseStorageType):
    """SQLAlchemy column type that stores files on the configured storage backend."""

    cache_ok = True

    def __init__(self, *args: object, **kwargs: object) -> None:
        super().__init__(_get_file_storage(), *args, **kwargs)

    def _process_upload_value(self, value: UploadValue, file_obj: BinaryIO) -> str:
        file = StorageFile(name=value.filename, storage=_get_file_storage())
        file.write(file=file_obj)
        return file.name

    def process_result_value(self, value: str | None, dialect: Dialect) -> StorageFile | None:
        """Hydrate a database value as a storage-backed file object."""
        del dialect
        if value is None:
            return value
        return StorageFile(name=value, storage=_get_file_storage())


class ImageType(_BaseStorageType):
    """SQLAlchemy column type that stores images on the configured storage backend."""

    cache_ok = True

    def __init__(self, *args: object, **kwargs: object) -> None:
        super().__init__(_get_image_storage(), *args, **kwargs)

    def _process_upload_value(self, value: UploadValue, file_obj: BinaryIO) -> str:
        validate_image_file(file_obj)
        file_obj.seek(0)
        image = StorageImage(name=value.filename, storage=_get_image_storage())
        image.write(file=file_obj)
        return image.name

    def process_result_value(self, value: str | None, dialect: Dialect) -> StorageImage | None:
        """Hydrate a database value as a storage-backed image object. No file IO performed here."""
        del dialect
        if value is None:
            return value
        return StorageImage(name=value, storage=_get_image_storage())
