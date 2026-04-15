"""Lightweight local file storage primitives for SQLAlchemy models."""

from __future__ import annotations

import io
import os
import re
from abc import ABC, abstractmethod
from importlib import import_module
from pathlib import Path
from typing import TYPE_CHECKING, Any, cast

from anyio import open_file, to_thread
from sqlalchemy.engine.interfaces import Dialect
from sqlalchemy.types import TypeDecorator, Unicode

from app.api.file_storage.exceptions import FastAPIStorageFileNotFoundError
from app.core.config import StorageBackend, settings
from app.core.images import validate_image_file

if TYPE_CHECKING:
    from typing import BinaryIO, Protocol, Self

    from fastapi import UploadFile

    class UploadValue(Protocol):
        """Minimal protocol for uploaded files passed from FastAPI."""

        file: BinaryIO
        filename: str

    class _S3Client(Protocol):
        """Narrow protocol for the boto3 S3 client methods used by S3Storage."""

        def head_object(self, *, bucket: str, key: str) -> dict: ...
        def get_object(self, *, bucket: str, key: str) -> dict: ...
        def upload_fileobj(self, fileobj: BinaryIO, *, bucket: str, key: str) -> None: ...


_FILENAME_ASCII_STRIP_RE = re.compile(r"[^A-Za-z0-9_.-]")


def _import_boto3() -> object:
    """Import boto3 lazily so the optional dependency stays optional."""
    return import_module("boto3")


def _client_error_type() -> type[Exception]:
    """Return botocore's ClientError type, or a local fallback when unavailable."""
    try:
        return import_module("botocore.exceptions").ClientError
    except ImportError:
        class ClientError(Exception):
            """Fallback exception used when botocore is not installed."""

        return ClientError


def secure_filename(filename: str) -> str:
    """Normalize a filename to a safe ASCII representation."""
    for sep in os.path.sep, os.path.altsep:
        if sep:
            filename = filename.replace(sep, " ")

    normalized_filename = _FILENAME_ASCII_STRIP_RE.sub("", "_".join(filename.split()))
    return str(normalized_filename).strip("._")


class BaseStorage(ABC):
    """Abstract interface for storage backends.

    All backends must implement the synchronous primitives used by the
    SQLAlchemy column types as well as the async upload helpers called from
    the CRUD layer.  New backends (e.g. S3-compatible) should subclass this
    and override every abstract method.
    """

    OVERWRITE_EXISTING_FILES = True

    @abstractmethod
    def get_name(self, name: str) -> str:
        """Return the normalized storage name."""

    @abstractmethod
    def get_path(self, name: str) -> str:
        """Return the absolute path (or URL) for a stored file."""

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


class StorageImage(StorageFile):
    """Storage file wrapper for image files."""

    __slots__ = ()

    def __new__(cls, *, name: str, storage: BaseStorage) -> Self:
        """Create the string value from the resolved storage path."""
        return str.__new__(cls, storage.get_path(name))


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


class S3Storage(BaseStorage):
    """S3-compatible storage backend.

    Requires ``boto3`` to be installed (``uv sync --group s3``).
    Credentials are resolved in the standard boto3 chain (env vars, config file,
    instance profile) when ``access_key_id``/``secret_access_key`` are empty.
    """

    def __init__(
        self,
        bucket: str,
        prefix: str,
        *,
        region: str = "us-east-1",
        access_key_id: str | None = None,
        secret_access_key: str | None = None,
        endpoint_url: str | None = None,
        base_url: str | None = None,
    ) -> None:
        self._bucket = bucket
        self._prefix = prefix.strip("/")
        self._region = region
        self._access_key_id = access_key_id or None
        self._secret_access_key = secret_access_key or None
        self._endpoint_url = endpoint_url
        self._base_url = base_url.rstrip("/") if base_url else None
        self._client: _S3Client | None = None

    def _get_client(self) -> _S3Client:
        """Return a cached boto3 S3 client, importing boto3 lazily."""
        if self._client is None:
            try:
                boto3 = cast("Any", _import_boto3())
            except ImportError:
                msg = "boto3 is required for S3 storage. Install it with: uv sync --group s3"
                raise ImportError(msg) from None
            kwargs: dict[str, object] = {"region_name": self._region}
            if self._access_key_id:
                kwargs["aws_access_key_id"] = self._access_key_id
            if self._secret_access_key:
                kwargs["aws_secret_access_key"] = self._secret_access_key
            if self._endpoint_url:
                kwargs["endpoint_url"] = self._endpoint_url
            self._client = boto3.client("s3", **kwargs)
        return self._client

    def _s3_key(self, name: str) -> str:
        filename = secure_filename(Path(name).name)
        return f"{self._prefix}/{filename}" if self._prefix else filename

    def get_name(self, name: str) -> str:
        """Normalize a file name for storage."""
        return secure_filename(Path(name).name)

    def get_path(self, name: str) -> str:
        """Return the public URL for a stored object."""
        filename = secure_filename(Path(name).name)
        key = f"{self._prefix}/{filename}" if self._prefix else filename
        if self._base_url:
            return f"{self._base_url}/{key}"
        if self._endpoint_url:
            return f"{self._endpoint_url.rstrip('/')}/{self._bucket}/{key}"
        return f"https://{self._bucket}.s3.{self._region}.amazonaws.com/{key}"

    def get_size(self, name: str) -> int:
        """Return the object size in bytes via a HEAD request."""
        client = cast("Any", self._get_client())
        response = client.head_object(Bucket=self._bucket, Key=self._s3_key(name))
        return response["ContentLength"]

    def open(self, name: str) -> BinaryIO:
        """Download and return the object body as a BytesIO buffer."""
        client_error = _client_error_type()
        client = cast("Any", self._get_client())
        try:
            response = client.get_object(Bucket=self._bucket, Key=self._s3_key(name))
            return io.BytesIO(response["Body"].read())
        except client_error as e:
            error_response = cast("dict[str, Any]", getattr(e, "response", {}))
            if error_response.get("Error", {}).get("Code") in ("404", "NoSuchKey"):
                details = str(e) if settings.debug else None
                raise FastAPIStorageFileNotFoundError(name, details=details) from e
            raise

    def write(self, file: BinaryIO, name: str) -> str:
        """Upload a binary file to S3 and return the stored name."""
        filename = self.get_name(name)
        file.seek(0)
        client = cast("Any", self._get_client())
        client.upload_fileobj(file, Bucket=self._bucket, Key=self._s3_key(name))
        return filename

    def generate_new_filename(self, filename: str) -> str:
        """Return a collision-free key name by probing S3 with HEAD requests."""
        client_error = _client_error_type()
        client = cast("Any", self._get_client())
        counter = 0
        stem, extension = Path(filename).stem, Path(filename).suffix
        name = filename
        while True:
            try:
                client.head_object(Bucket=self._bucket, Key=self._s3_key(name))
            except client_error as e:
                error_response = cast("dict[str, Any]", getattr(e, "response", {}))
                if error_response.get("Error", {}).get("Code") in ("404", "NoSuchKey"):
                    break
                raise
            counter += 1
            name = f"{stem}_{counter}{extension}"
        return name

    async def write_upload(self, upload_file: UploadFile, name: str) -> str:
        """Upload a file to S3 using a background thread and return the stored name."""
        filename = self.get_name(name)
        await upload_file.seek(0)
        client = cast("Any", self._get_client())
        bucket, key = self._bucket, self._s3_key(name)
        file_obj = upload_file.file
        await to_thread.run_sync(lambda: client.upload_fileobj(file_obj, Bucket=bucket, Key=key))
        await upload_file.close()
        return filename

    async def write_image_upload(self, upload_file: UploadFile, name: str) -> str:
        """Validate and upload an image to S3."""
        await to_thread.run_sync(validate_image_file, upload_file.file)
        return await self.write_upload(upload_file, name)


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
