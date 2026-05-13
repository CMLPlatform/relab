"""ASVS V5 malware scanning controls for uploads."""

from __future__ import annotations

import struct
from typing import TYPE_CHECKING, Protocol

import anyio

from app.api.common.exceptions import BadRequestError, ServiceUnavailableError
from app.core.config import settings

if TYPE_CHECKING:
    from typing import BinaryIO

    from fastapi import UploadFile


CLAMAV_CHUNK_SIZE = 64 * 1024
CLAMAV_FOUND_MARKER = " FOUND"
CLAMAV_OK_MARKER = " OK"
CLAMAV_UNAVAILABLE_EXCEPTIONS = (
    TimeoutError,
    OSError,
    anyio.BrokenResourceError,
    anyio.ClosedResourceError,
    anyio.EndOfStream,
)
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


class ClamAVScanner:
    """Small ClamAV INSTREAM client."""

    def __init__(self, *, host: str, port: int, timeout_seconds: float) -> None:
        self.host = host
        self.port = port
        self.timeout_seconds = timeout_seconds

    async def scan(self, fileobj: BinaryIO) -> None:
        """Stream a file to ClamAV and raise on detections or scan errors."""
        fileobj.seek(0)
        try:
            with anyio.fail_after(self.timeout_seconds):
                async with await anyio.connect_tcp(self.host, self.port) as stream:
                    await stream.send(b"zINSTREAM\0")
                    while chunk := fileobj.read(CLAMAV_CHUNK_SIZE):
                        await stream.send(struct.pack("!I", len(chunk)) + chunk)
                    await stream.send(struct.pack("!I", 0))
                    response = (await stream.receive(4096)).decode("utf-8", errors="replace").removesuffix("\0").strip()
        except CLAMAV_UNAVAILABLE_EXCEPTIONS as exc:
            raise MalwareScanUnavailableError(details=None) from exc
        finally:
            fileobj.seek(0)

        if response.endswith(CLAMAV_FOUND_MARKER):
            signature = response.removesuffix(CLAMAV_FOUND_MARKER).split(":", 1)[-1].strip()
            raise MalwareDetectedError(signature or None)
        if not response.endswith(CLAMAV_OK_MARKER):
            raise MalwareScanUnavailableError(details=response.strip() or None)


def get_upload_scanner() -> UploadScanner | None:
    """Build the configured malware scanner, or None when unavailable."""
    if not settings.malware_scan_enabled:
        return None
    if not settings.clamav_host:
        return None
    return ClamAVScanner(
        host=settings.clamav_host,
        port=settings.clamav_port,
        timeout_seconds=settings.clamav_scan_timeout_seconds,
    )


def validate_malware_scanner_configuration() -> None:
    """Fail startup when enabled upload scanning cannot scan untrusted uploads."""
    scanner_missing = settings.malware_scan_enabled and not settings.clamav_host
    if scanner_missing:
        msg = "Malware scanning is enabled but CLAMAV_HOST is not configured."
        raise RuntimeError(msg)


async def scan_upload_or_raise(
    upload_file: UploadFile,
    *,
    scanner: UploadScanner | None = None,
) -> None:
    """Scan an upload before storage, failing closed when scanning is required."""
    scanner = scanner if scanner is not None else get_upload_scanner()

    if scanner is None:
        if settings.malware_scan_enabled:
            raise MalwareScanUnavailableError(details=None)
        upload_file.file.seek(0)
        return

    await scanner.scan(upload_file.file)
    upload_file.file.seek(0)
