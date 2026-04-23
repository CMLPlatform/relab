"""Filesystem-backed storage backend."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from anyio import open_file, to_thread

from app.api.file_storage.exceptions import FastAPIStorageFileNotFoundError
from app.api.file_storage.models.storage_core import BaseStorage, secure_filename
from app.core.config import settings
from app.core.images import validate_image_file

if TYPE_CHECKING:
    from typing import BinaryIO

    from fastapi import UploadFile


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
        """Open a stored file in binary mode, mapping missing files to the API error."""
        try:
            return (self._path / Path(name)).open("rb")
        except FileNotFoundError as e:
            details = str(e) if settings.debug else None
            raise FastAPIStorageFileNotFoundError(name, details=details) from e

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
