"""Filesystem-backed storage backend."""

from pathlib import Path
from typing import TYPE_CHECKING

from anyio import Path as AnyIOPath
from anyio import open_file

from app.api.file_storage.models.storage_core import BaseStorage, secure_filename

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

    def write(self, file: BinaryIO, name: str) -> str:
        """Write a binary file to local storage."""
        self._ensure_path()
        filename = secure_filename(name)
        path = self._path / Path(filename)

        file.seek(0)
        with path.open("xb") as output:
            while chunk := file.read(self.default_chunk_size):
                output.write(chunk)

        return str(path)

    async def write_upload(self, upload_file: UploadFile, name: str) -> str:
        """Write an uploaded file using async file I/O."""
        self._ensure_path()
        filename = self.get_name(name)
        path = self._path / filename

        await upload_file.seek(0)
        async with await open_file(path, "xb") as output:
            while chunk := await upload_file.read(self.default_chunk_size):
                await output.write(chunk)

        await upload_file.close()
        return filename

    async def delete(self, name: str) -> None:
        """Delete a stored file, tolerating an already-missing file."""
        await AnyIOPath(self._path / name).unlink(missing_ok=True)
