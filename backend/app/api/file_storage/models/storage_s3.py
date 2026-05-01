"""S3-compatible storage backend."""

from __future__ import annotations

import io
from importlib import import_module
from pathlib import Path
from typing import TYPE_CHECKING, Any

from anyio import to_thread

from app.api.file_storage.exceptions import FastAPIStorageFileNotFoundError
from app.api.file_storage.models.storage_core import BaseStorage, secure_filename
from app.api.file_storage.upload_policy import validate_image_upload_content
from app.core.config import settings

if TYPE_CHECKING:
    from typing import BinaryIO

    from fastapi import UploadFile


# boto3 is an optional dep; its stubs live in boto3-stubs (heavy, not installed).
# We expose the client as Any so the dynamic boto3 API doesn't require per-call casts.
def _import_boto3() -> Any:  # noqa: ANN401
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


class S3Storage(BaseStorage):
    """S3-compatible storage backend."""

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
        self._client: Any = None

    def _get_client(self) -> Any:  # noqa: ANN401
        """Return a cached boto3 S3 client, importing boto3 lazily."""
        if self._client is None:
            try:
                boto3 = _import_boto3()
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
        client = self._get_client()
        response = client.head_object(Bucket=self._bucket, Key=self._s3_key(name))
        return response["ContentLength"]

    def open(self, name: str) -> BinaryIO:
        """Download and return the object body as a BytesIO buffer."""
        client_error = _client_error_type()
        client = self._get_client()
        try:
            response = client.get_object(Bucket=self._bucket, Key=self._s3_key(name))
            return io.BytesIO(response["Body"].read())
        except client_error as e:
            error_response: dict[str, Any] = getattr(e, "response", {})
            if error_response.get("Error", {}).get("Code") in ("404", "NoSuchKey"):
                details = str(e) if settings.debug else None
                raise FastAPIStorageFileNotFoundError(name, details=details) from e
            raise

    def write(self, file: BinaryIO, name: str) -> str:
        """Upload a binary file to S3 and return the stored name."""
        filename = self.get_name(name)
        file.seek(0)
        client = self._get_client()
        client.upload_fileobj(file, Bucket=self._bucket, Key=self._s3_key(name))
        return filename

    def generate_new_filename(self, filename: str) -> str:
        """Return a collision-free key name by probing S3 with HEAD requests."""
        client_error = _client_error_type()
        client = self._get_client()
        counter = 0
        stem, extension = Path(filename).stem, Path(filename).suffix
        name = filename
        while True:
            try:
                client.head_object(Bucket=self._bucket, Key=self._s3_key(name))
            except client_error as e:
                error_response: dict[str, Any] = getattr(e, "response", {})
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
        client = self._get_client()
        bucket, key = self._bucket, self._s3_key(name)
        file_obj = upload_file.file
        await to_thread.run_sync(lambda: client.upload_fileobj(file_obj, Bucket=bucket, Key=key))
        await upload_file.close()
        return filename

    async def write_image_upload(self, upload_file: UploadFile, name: str) -> str:
        """Validate and upload an image to S3."""
        await to_thread.run_sync(validate_image_upload_content, upload_file)
        return await self.write_upload(upload_file, name)
