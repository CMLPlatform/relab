"""Lightweight local file storage primitives for SQLAlchemy models."""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import TYPE_CHECKING, Any, ClassVar, cast

from anyio import open_file, to_thread
from PIL import Image
from sqlalchemy.engine.interfaces import Dialect
from sqlalchemy.types import TypeDecorator, Unicode

from app.api.file_storage.exceptions import FastAPIStorageFileNotFoundError
from app.core.config import settings
from app.core.images import validate_image_file

if TYPE_CHECKING:
    from collections.abc import Callable
    from typing import BinaryIO, Protocol, Self

    from fastapi import UploadFile

    class UploadValue(Protocol):
        """Minimal protocol for uploaded files passed from FastAPI."""

        file: BinaryIO
        filename: str


_FILENAME_ASCII_STRIP_RE = re.compile(r"[^A-Za-z0-9_.-]")


def secure_filename(filename: str) -> str:
    """Normalize a filename to a safe ASCII representation."""
    for sep in os.path.sep, os.path.altsep:
        if sep:
            filename = filename.replace(sep, " ")

    normalized_filename = _FILENAME_ASCII_STRIP_RE.sub("", "_".join(filename.split()))
    return str(normalized_filename).strip("._")


class BaseStorage:
    """Base interface for storage backends."""

    OVERWRITE_EXISTING_FILES = True

    def get_name(self, name: str) -> str:
        """Return the normalized storage name."""
        raise NotImplementedError

    def get_path(self, name: str) -> str:
        """Return the absolute path for a stored file."""
        raise NotImplementedError

    def get_size(self, name: str) -> int:
        """Return the file size in bytes."""
        raise NotImplementedError

    def open(self, name: str) -> BinaryIO:
        """Open a stored file for reading."""
        raise NotImplementedError

    def write(self, file: BinaryIO, name: str) -> str:
        """Persist an uploaded file."""
        raise NotImplementedError

    def generate_new_filename(self, filename: str) -> str:
        """Generate a collision-free file name."""
        raise NotImplementedError


class StorageFile(str):
    """String-like file wrapper returned from storage-backed columns."""

    __slots__ = ("_name", "_storage")

    def __new__(cls, *, name: str, storage: BaseStorage) -> Self:
        """Create the string value from the resolved storage path."""
        return str.__new__(cls, storage.get_path(name))

    def __init__(self, *, name: str, storage: BaseStorage) -> None:
        self._name = name
        self._storage = storage

    @property
    def name(self) -> str:
        """File name including extension."""
        return self._storage.get_name(self._name)

    @property
    def path(self) -> str:
        """Absolute file path."""
        return self._storage.get_path(self._name)

    @property
    def size(self) -> int:
        """File size in bytes."""
        return self._storage.get_size(self._name)

    def open(self) -> BinaryIO:
        """Open a binary file handle to the stored file."""
        return self._storage.open(self._name)

    def write(self, file: BinaryIO) -> str:
        """Write binary file contents to storage."""
        if not self._storage.OVERWRITE_EXISTING_FILES:
            self._name = self._storage.generate_new_filename(self._name)

        return self._storage.write(file=file, name=self._name)

    def __str__(self) -> str:
        return self.path


class StorageImage(StorageFile):
    """Storage file wrapper enriched with image dimensions."""

    __slots__ = ("_height", "_width")

    def __new__(cls, *, name: str, storage: BaseStorage, height: int, width: int) -> Self:
        """Create the string value from the resolved storage path."""
        del height, width
        return str.__new__(cls, storage.get_path(name))

    def __init__(self, *, name: str, storage: BaseStorage, height: int, width: int) -> None:
        super().__init__(name=name, storage=storage)
        self._height = height
        self._width = width

    @property
    def height(self) -> int:
        """Image height in pixels."""
        return self._height

    @property
    def width(self) -> int:
        """Image width in pixels."""
        return self._width


class FileSystemStorage(BaseStorage):
    """Filesystem-backed local storage."""

    default_chunk_size = 64 * 1024

    def __init__(self, path: str, *, create_path: bool = False) -> None:
        self._path = Path(path)
        if create_path:
            self._ensure_path()

    def _ensure_path(self) -> None:
        """Create the storage directory if needed."""
        self._path.mkdir(parents=True, exist_ok=True)

    def get_name(self, name: str) -> str:
        """Normalize a file name for storage."""
        return secure_filename(Path(name).name)

    def get_path(self, name: str) -> str:
        """Return the absolute path for a stored file."""
        return str(self._path / Path(name))

    def get_size(self, name: str) -> int:
        """Return the file size in bytes."""
        return (self._path / name).stat().st_size

    def open(self, name: str) -> BinaryIO:
        """Open a stored file in binary mode."""
        return (self._path / Path(name)).open("rb")

    def write(self, file: BinaryIO, name: str) -> str:
        """Write a binary file to local storage."""
        self._ensure_path()
        filename = secure_filename(name)
        path = self._path / Path(filename)

        file.seek(0)
        with path.open("wb") as output:
            while chunk := file.read(self.default_chunk_size):
                output.write(chunk)

        return str(path)

    def generate_new_filename(self, filename: str) -> str:
        """Generate a unique filename if collisions are not allowed."""
        counter = 0
        path = self._path / filename
        stem, extension = Path(filename).stem, Path(filename).suffix

        while path.exists():
            counter += 1
            path = self._path / f"{stem}_{counter}{extension}"

        return path.name

    async def write_upload(self, upload_file: UploadFile, name: str) -> str:
        """Write an uploaded file using async file I/O."""
        self._ensure_path()
        filename = self.get_name(name)
        path = self._path / filename

        await upload_file.seek(0)
        async with await open_file(path, "wb") as output:
            while chunk := await upload_file.read(self.default_chunk_size):
                await output.write(chunk)

        await upload_file.close()
        return filename

    async def write_image_upload(self, upload_file: UploadFile, name: str) -> str:
        """Validate and write an uploaded image using async file I/O."""
        self._ensure_path()
        await to_thread.run_sync(validate_image_file, upload_file.file)

        return await self.write_upload(upload_file, name)


class CustomFileSystemStorage(FileSystemStorage):
    """Filesystem storage with custom error handling for the app."""

    def open(self, name: str) -> BinaryIO:
        """Map missing files to the API-specific not-found error."""
        try:
            return super().open(name)
        except FileNotFoundError as e:
            details = str(e) if settings.debug else None
            raise FastAPIStorageFileNotFoundError(name, details=details) from e


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


class _FileType(_BaseStorageType):
    """Store uploaded files on disk and persist only the file name."""

    def _process_upload_value(self, value: UploadValue, file_obj: BinaryIO) -> str:
        file = StorageFile(name=value.filename, storage=self.storage)
        file.write(file=file_obj)
        return file.name

    def process_result_value(self, value: str | None, dialect: Dialect) -> StorageFile | None:
        """Hydrate a database value as a storage-backed file object."""
        del dialect
        if value is None:
            return value

        return StorageFile(name=value, storage=self.storage)


class _ImageType(_BaseStorageType):
    """Store uploaded images on disk and persist only the file name."""

    def _process_upload_value(self, value: UploadValue, file_obj: BinaryIO) -> str:
        validate_image_file(file_obj)
        with Image.open(file_obj) as image_file:
            width, height = image_file.size

        file_obj.seek(0)
        image = StorageImage(name=value.filename, storage=self.storage, height=height, width=width)
        image.write(file=file_obj)
        return image.name

    def process_result_value(self, value: str | None, dialect: Dialect) -> StorageImage | None:
        """Hydrate a database value as a storage-backed image object."""
        del dialect
        if value is None:
            return value

        with Image.open(self.storage.get_path(value)) as image:
            width, height = image.size

        return StorageImage(name=value, storage=self.storage, height=height, width=width)


def get_storage(path: Path) -> CustomFileSystemStorage:
    """Build a storage backend for a configured filesystem path."""
    return CustomFileSystemStorage(path=str(path))


class _ConfiguredStorageTypeMixin:
    """Inject a configured storage backend into a SQLAlchemy type."""

    storage_factory: ClassVar[Callable[[], CustomFileSystemStorage]]

    def __init__(self, *args: object, **kwargs: object) -> None:
        super_init = cast("Any", super().__init__)
        super_init(type(self).storage_factory(), *args, **kwargs)


class _MissingFileReturnsNoneMixin:
    """Normalize missing files to None for graceful application-level handling."""

    def process_result_value(self, value: Any, dialect: Dialect) -> StorageImage | None:  # noqa: ANN401 # Any-type value is expected by the parent class signature
        try:
            return cast("Any", super()).process_result_value(value, dialect)
        except FileNotFoundError:
            return None


class FileType(_ConfiguredStorageTypeMixin, _FileType):
    """Custom file type with the configured local file storage."""

    @staticmethod
    def storage_factory() -> CustomFileSystemStorage:
        """Build the storage backend used by file columns."""
        return get_storage(settings.file_storage_path)


class ImageType(_MissingFileReturnsNoneMixin, _ConfiguredStorageTypeMixin, _ImageType):
    """Custom image type with the configured local image storage."""

    @staticmethod
    def storage_factory() -> CustomFileSystemStorage:
        """Build the storage backend used by image columns."""
        return get_storage(settings.image_storage_path)
