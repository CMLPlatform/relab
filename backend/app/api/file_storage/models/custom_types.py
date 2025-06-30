"""Custom types for FastAPI Storages models."""

from typing import Any, BinaryIO

from fastapi_storages import FileSystemStorage, StorageImage
from fastapi_storages.integrations.sqlalchemy import FileType as _FileType
from fastapi_storages.integrations.sqlalchemy import ImageType as _ImageType
from sqlalchemy import Dialect

from app.api.file_storage.exceptions import FastAPIStorageFileNotFoundError
from app.core.config import settings


## Custom error handling for file not found in storage
class CustomFileSystemStorage(FileSystemStorage):
    """File system storage with custom error handling."""

    def open(self, name: str) -> BinaryIO:
        """Override of base class 'open' method for custom error handling."""
        try:
            return super().open(name)
        except FileNotFoundError as e:
            details = str(e) if settings.debug else None
            raise FastAPIStorageFileNotFoundError(name, details=details) from e


## File and Image types with custom storage paths
class FileType(_FileType):
    """Custom file type with a default FileSystemStorage path.

    This supports alembic migrations on FastAPI Storages models.
    """

    def __init__(
        self, *args: Any, **kwargs: Any
    ) -> None:  # Any-type args and kwargs are expected by the parent class signature
        storage = CustomFileSystemStorage(path=str(settings.file_storage_path))
        super().__init__(*args, storage=storage, **kwargs)


class ImageType(_ImageType):
    """Custom image type with a default FileSystemStorage path.

    This supports alembic migrations on FastAPI Storages models.
    """

    def __init__(
        self, *args: Any, **kwargs: Any
    ) -> None:  # Any-type args and kwargs are expected by the parent class signature
        storage = CustomFileSystemStorage(path=str(settings.image_storage_path))
        super().__init__(*args, storage=storage, **kwargs)

    def process_result_value(self, value: Any, dialect: Dialect) -> StorageImage | None:
        """Override the default process_result_value method to raise a custom error if the file is not found."""
        try:
            return super().process_result_value(value, dialect)
        except FileNotFoundError as e:
            raise FastAPIStorageFileNotFoundError(value, str(e)) from e
