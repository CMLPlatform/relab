"""Core storage abstractions shared by concrete backends and SQLAlchemy types."""

from __future__ import annotations

import os
import re
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
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


class BaseStorage(ABC):
    """Abstract interface for storage backends."""

    OVERWRITE_EXISTING_FILES = True

    @abstractmethod
    def get_name(self, name: str) -> str:
        """Return the normalized storage name."""

    @abstractmethod
    def get_path(self, name: str) -> str:
        """Return the absolute path or URL for a stored file."""

    @abstractmethod
    def get_size(self, name: str) -> int:
        """Return the file size in bytes."""

    @abstractmethod
    def open(self, name: str) -> BinaryIO:
        """Open a stored file for reading."""

    @abstractmethod
    def write(self, file: BinaryIO, name: str) -> str:
        """Persist a binary file and return the stored name."""

    @abstractmethod
    def generate_new_filename(self, filename: str) -> str:
        """Generate a collision-free file name."""

    @abstractmethod
    async def write_upload(self, upload_file: UploadFile, name: str) -> str:
        """Persist an uploaded file asynchronously and return the stored name."""

    @abstractmethod
    async def write_image_upload(self, upload_file: UploadFile, name: str) -> str:
        """Validate and persist an uploaded image asynchronously."""


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

    def __eq__(self, other: object) -> bool:
        return str.__eq__(self, other)

    def __hash__(self) -> int:
        return str.__hash__(self)


class StorageImage(StorageFile):
    """Storage file wrapper for image files."""

    __slots__ = ()

    def __new__(cls, *, name: str, storage: BaseStorage) -> Self:
        """Create the string value from the resolved storage path."""
        return str.__new__(cls, storage.get_path(name))
