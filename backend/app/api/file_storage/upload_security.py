"""ASVS V5 upload quota and malware scanning controls."""
# spell-checker: ignore CLAMAV clamav

from __future__ import annotations

import struct
from dataclasses import dataclass
from typing import TYPE_CHECKING, Protocol

import anyio
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.common.exceptions import BadRequestError, PayloadTooLargeError, ServiceUnavailableError
from app.api.data_collection.models.product import Product
from app.api.file_storage.models import File, Image, MediaParentType
from app.core.config import settings
from app.core.config.models import Environment

if TYPE_CHECKING:
    from typing import BinaryIO
    from uuid import UUID

    from fastapi import UploadFile


CLAMAV_CHUNK_SIZE = 64 * 1024
CLAMAV_FOUND_MARKER = " FOUND"
CLAMAV_OK_MARKER = " OK"
MALWARE_SCANNING_UNAVAILABLE_MESSAGE = "Malware scanning is unavailable."


class UploadScanner(Protocol):
    """Minimal async scanner contract for untrusted uploads."""

    async def scan(self, fileobj: BinaryIO) -> None:
        """Raise when the supplied file is malicious or cannot be scanned."""


class MalwareDetectedError(BadRequestError):
    """Raised when malware scanning detects dangerous content."""

    def __init__(self, signature: str | None = None) -> None:
        message = "Uploaded file contains known malicious content."
        details = f"Scanner signature: {signature}" if signature else None
        super().__init__(message=message, details=details)


class MalwareScanUnavailableError(ServiceUnavailableError):
    """Raised when a required malware scanner cannot scan the upload."""

    def __init__(self, details: str | None = None) -> None:
        super().__init__(message=MALWARE_SCANNING_UNAVAILABLE_MESSAGE, details=details)


class UploadQuotaExceededError(PayloadTooLargeError):
    """Raised when a user exceeds upload quota limits."""

    def __init__(self, message: str) -> None:
        super().__init__(message=message)


class ClamAVScanner:
    """Small ClamAV INSTREAM client."""

    def __init__(self, *, host: str, port: int, timeout_seconds: float = 10.0) -> None:
        self.host = host
        self.port = port
        self.timeout_seconds = timeout_seconds

    async def scan(self, fileobj: BinaryIO) -> None:
        """Stream a file to ClamAV and raise on detections or scan errors."""
        fileobj.seek(0)
        try:
            with anyio.fail_after(self.timeout_seconds):
                stream = await anyio.connect_tcp(self.host, self.port)
                async with stream:
                    await stream.send(b"zINSTREAM\0")
                    while chunk := fileobj.read(CLAMAV_CHUNK_SIZE):
                        await stream.send(struct.pack("!I", len(chunk)) + chunk)
                    await stream.send(struct.pack("!I", 0))
                    response = (await stream.receive(4096)).decode("utf-8", errors="replace")
        except (TimeoutError, OSError, anyio.EndOfStream) as exc:
            raise MalwareScanUnavailableError(details=None) from exc
        finally:
            fileobj.seek(0)

        if CLAMAV_FOUND_MARKER in response:
            signature = response.split(":", 1)[-1].replace("FOUND", "").strip()
            raise MalwareDetectedError(signature or None)
        if CLAMAV_OK_MARKER not in response:
            raise MalwareScanUnavailableError(details=response.strip() or None)


@dataclass(frozen=True, slots=True)
class UploadQuotaSnapshot:
    """Current per-user upload quota usage."""

    file_count: int
    total_bytes: int


def malware_scanning_required(*, environment: Environment, enabled: bool) -> bool:
    """Return whether missing malware scanning must fail closed."""
    del environment
    return enabled


def get_upload_scanner() -> UploadScanner | None:
    """Build the configured malware scanner, or None when unavailable."""
    if not settings.malware_scan_enabled:
        return None
    if not settings.clamav_host:
        return None
    return ClamAVScanner(host=settings.clamav_host, port=settings.clamav_port)


def validate_malware_scanner_configuration() -> None:
    """Fail startup when enabled upload scanning cannot scan untrusted uploads."""
    scanner_missing = settings.malware_scan_enabled and not settings.clamav_host
    if scanner_missing:
        msg = "Malware scanning is enabled but CLAMAV_HOST is not configured."
        raise RuntimeError(msg)


async def _product_upload_quota_snapshot(db: AsyncSession, quota_user_id: UUID) -> UploadQuotaSnapshot:
    """Return current upload count and byte usage for one product owner."""
    totals = UploadQuotaSnapshot(file_count=0, total_bytes=0)
    for model in (File, Image):
        result = await db.execute(
            select(
                func.count(model.id),
                func.coalesce(func.sum(model.upload_size_bytes), 0),
            )
            .join(
                Product,
                and_(
                    model.parent_type == MediaParentType.PRODUCT,
                    model.parent_id == Product.id,
                ),
            )
            .where(Product.owner_id == quota_user_id)
        )
        file_count, total_bytes = result.one()
        totals = UploadQuotaSnapshot(
            file_count=totals.file_count + int(file_count or 0),
            total_bytes=totals.total_bytes + int(total_bytes or 0),
        )
    return totals


async def enforce_product_upload_quota(
    db: AsyncSession,
    *,
    quota_user_id: UUID | None,
    upload_size_bytes: int,
) -> None:
    """Enforce per-user upload quotas for product-owned media."""
    if quota_user_id is None:
        return
    snapshot = await _product_upload_quota_snapshot(db, quota_user_id)
    enforce_upload_quota(
        snapshot,
        upload_size_bytes=upload_size_bytes,
        max_files=settings.max_upload_files_per_user,
        max_total_bytes=settings.max_upload_bytes_per_user_mb * 1024 * 1024,
        quota_user_id=quota_user_id,
    )


async def scan_upload_or_raise(
    upload_file: UploadFile,
    *,
    scanner: UploadScanner | None = None,
    required: bool | None = None,
) -> None:
    """Scan an upload before storage, failing closed when scanning is required."""
    is_required = (
        malware_scanning_required(
            environment=settings.environment,
            enabled=settings.malware_scan_enabled,
        )
        if required is None
        else required
    )
    scanner = scanner if scanner is not None else get_upload_scanner()

    if scanner is None:
        if is_required:
            raise MalwareScanUnavailableError(details=None)
        upload_file.file.seek(0)
        return

    await scanner.scan(upload_file.file)
    upload_file.file.seek(0)


def enforce_upload_quota(
    snapshot: UploadQuotaSnapshot,
    *,
    upload_size_bytes: int,
    max_files: int,
    max_total_bytes: int,
    quota_user_id: UUID,
) -> None:
    """Reject uploads that would exceed per-user count or byte quotas."""
    del quota_user_id
    if snapshot.file_count >= max_files:
        message = f"User has reached the maximum number of uploaded files ({max_files})."
        raise UploadQuotaExceededError(message)
    if snapshot.total_bytes + upload_size_bytes > max_total_bytes:
        message = f"User storage quota exceeded. Maximum total upload size: {max_total_bytes} bytes."
        raise UploadQuotaExceededError(message)
