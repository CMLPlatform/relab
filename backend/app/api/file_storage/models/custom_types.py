"""Custom types for FastAPI Storages models."""

from pathlib import Path
from typing import TYPE_CHECKING, Any, BinaryIO

from fastapi_storages import FileSystemStorage, StorageImage
from fastapi_storages.integrations.sqlalchemy import FileType as _FileType
from fastapi_storages.integrations.sqlalchemy import ImageType as _ImageType

from app.api.file_storage.exceptions import FastAPIStorageFileNotFoundError
from app.core.config import settings

if TYPE_CHECKING:
    from sqlalchemy import Dialect


## Custom error handling for file not found in storage
class CustomFileSystemStorage(FileSystemStorage):
    """File system storage with custom error handling."""

    def __init__(self, path: str) -> None:
        # Do not create the path at import-time. Creating directories during
        # module import (e.g. when alembic loads models) can trigger
        # PermissionError if a runtime volume is mounted and owned by root.
        # Defer directory creation until a write is attempted.
        self._path = Path(path)

    def open(self, name: str) -> BinaryIO:
        """Override of base class 'open' method for custom error handling."""
        try:
            return super().open(name)
        except FileNotFoundError as e:
            details = str(e) if settings.debug else None
            raise FastAPIStorageFileNotFoundError(name, details=details) from e

    def write(self, file: BinaryIO, name: str) -> str:
        """Ensure the storage directory exists before writing the file.

        This creates directories lazily on the first write, avoiding mkdir at
        import time which breaks migrations.
        """
        # Try to create the storage directory; allow PermissionError to
        # propagate so callers can handle it if the runtime volume is not
        # writable.
        self._path.mkdir(parents=True, exist_ok=True)

        return super().write(file=file, name=name)


## File and Image types with custom storage paths
class FileType(_FileType):
    """Custom file type with a default FileSystemStorage path.

    This supports alembic migrations on FastAPI Storages models.
    """

    def __init__(self, *args: Any, **kwargs: Any) -> None:  # noqa: ANN401 # Any-type args and kwargs are expected by the parent class signature
        storage = CustomFileSystemStorage(path=str(settings.file_storage_path))
        args = (storage, *args)
        super().__init__(*args, **kwargs)


class ImageType(_ImageType):
    """Custom image type with a default FileSystemStorage path.

    This supports alembic migrations on FastAPI Storages models.
    """

    def __init__(self, *args: Any, **kwargs: Any) -> None:  # noqa: ANN401 # Any-type args and kwargs are expected by the parent class signature
        storage = CustomFileSystemStorage(path=str(settings.image_storage_path))
        args = (storage, *args)
        super().__init__(*args, **kwargs)

    def process_result_value(self, value: Any, dialect: Dialect) -> StorageImage | None:  # noqa: ANN401 # Any-type value is expected by the parent class signature
        """Override the default process_result_value method to return None if the file is not found.

        Returning None instead of raising allows graceful handling at the application layer:
        - image_url falls back to the placeholder image
        - list endpoints can filter out images with missing files
        - only direct single-item fetch endpoints raise an error
        """
        try:
            return super().process_result_value(value, dialect)
        except FileNotFoundError:
            return None
