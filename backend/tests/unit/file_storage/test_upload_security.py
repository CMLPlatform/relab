"""Tests for ASVS V5 upload quota and malware scanning controls."""
# spell-checker: ignore clamav, clamd, EICAR

from __future__ import annotations

from io import BytesIO

import anyio
import pytest
from fastapi import UploadFile

from app.api.common.exceptions import PayloadTooLargeError, ServiceUnavailableError
from app.api.file_storage.upload_security import (
    ClamAVScanner,
    MalwareDetectedError,
    UploadQuotaSnapshot,
    enforce_upload_quota,
    get_upload_scanner,
    scan_upload_or_raise,
    validate_malware_scanner_configuration,
)


def _upload(content: bytes = b"clean") -> UploadFile:
    return UploadFile(filename="manual.pdf", file=BytesIO(content), size=len(content))


def test_upload_quota_allows_files_below_count_and_byte_limits() -> None:
    """A new upload below both per-user quota dimensions is accepted."""
    enforce_upload_quota(
        UploadQuotaSnapshot(file_count=9, total_bytes=900),
        upload_size_bytes=99,
        max_files=10,
        max_total_bytes=1000,
    )


@pytest.mark.parametrize(
    ("snapshot", "upload_size", "message"),
    [
        (UploadQuotaSnapshot(file_count=10, total_bytes=0), 1, "maximum number"),
        (UploadQuotaSnapshot(file_count=0, total_bytes=1000), 1, "storage quota"),
    ],
)
def test_upload_quota_rejects_count_and_total_size_breaches(
    snapshot: UploadQuotaSnapshot,
    upload_size: int,
    message: str,
) -> None:
    """Per-user quotas must prevent a single user from filling storage."""
    with pytest.raises(PayloadTooLargeError, match=message):
        enforce_upload_quota(
            snapshot,
            upload_size_bytes=upload_size,
            max_files=10,
            max_total_bytes=1000,
        )


async def test_optional_scanner_none_accepts_uploads() -> None:
    """The dev/test no-op path should leave clean uploads readable from the start."""
    upload = _upload()

    await scan_upload_or_raise(upload, scanner=None)

    assert upload.file.tell() == 0


class _InfectedScanner:
    async def scan(self, fileobj) -> None:  # noqa: ANN001
        del fileobj
        signature = "EICAR-Test-File"
        raise MalwareDetectedError(signature)


class _CleanScanner:
    async def scan(self, fileobj) -> None:  # noqa: ANN001
        fileobj.seek(0, 2)


async def test_scan_upload_accepts_clean_scanner_results() -> None:
    """Clean scanner results should leave uploads readable from the start."""
    upload = _upload()

    await scan_upload_or_raise(upload, scanner=_CleanScanner())

    assert upload.file.tell() == 0


async def test_scan_upload_rejects_infected_files() -> None:
    """Scanner detections must reject uploads before storage."""
    with pytest.raises(MalwareDetectedError, match="malicious"):
        await scan_upload_or_raise(_upload(), scanner=_InfectedScanner())


async def test_scan_upload_fails_closed_when_enabled_scanner_is_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    """Enabled production scanning must fail closed when no scanner is available."""
    monkeypatch.setattr("app.api.file_storage.upload_security.settings.malware_scan_enabled", True)
    monkeypatch.setattr("app.api.file_storage.upload_security.settings.clamav_host", "")

    with pytest.raises(ServiceUnavailableError, match="Malware scanning is unavailable"):
        await scan_upload_or_raise(_upload(), scanner=None)


class _ClamAVResponseStream:
    def __init__(self, response: bytes) -> None:
        self.response = response
        self.sent_chunks: list[bytes] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args) -> None:  # noqa: ANN002
        del args

    async def send(self, data: bytes) -> None:
        self.sent_chunks.append(data)

    async def receive(self, max_bytes: int) -> bytes:
        del max_bytes
        return self.response


@pytest.mark.parametrize(
    ("response", "expected_error"),
    [
        (b"stream: OK\0", None),
        (b"stream: Eicar-Test-Signature FOUND\0", MalwareDetectedError),
        (b"stream: scanner protocol error\0", ServiceUnavailableError),
        (b"stream: OK but trailing scanner noise\0", ServiceUnavailableError),
        (b"stream: FOUND but missing signature marker\0", ServiceUnavailableError),
    ],
)
async def test_clamav_scanner_parses_terminal_response_markers(
    monkeypatch: pytest.MonkeyPatch,
    response: bytes,
    expected_error: type[Exception] | None,
) -> None:
    """ClamAV response handling should use terminal status markers only."""

    async def _connect_tcp(host: str, port: int):  # noqa: ANN202
        assert host == "clamav"
        assert port == 3310
        return _ClamAVResponseStream(response)

    monkeypatch.setattr("app.api.file_storage.upload_security.anyio.connect_tcp", _connect_tcp)

    scanner = ClamAVScanner(host="clamav", port=3310, timeout_seconds=1)

    if expected_error is None:
        await scanner.scan(BytesIO(b"clean"))
        return

    with pytest.raises(expected_error):
        await scanner.scan(BytesIO(b"clean"))


def test_get_upload_scanner_uses_configured_clamav_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    """The scanner timeout should be deploy-configurable for ClamAV reload windows."""
    monkeypatch.setattr("app.api.file_storage.upload_security.settings.malware_scan_enabled", True)
    monkeypatch.setattr("app.api.file_storage.upload_security.settings.clamav_host", "clamav")
    monkeypatch.setattr("app.api.file_storage.upload_security.settings.clamav_port", 3310)
    monkeypatch.setattr("app.api.file_storage.upload_security.settings.clamav_scan_timeout_seconds", 45.0)

    scanner = get_upload_scanner()

    assert isinstance(scanner, ClamAVScanner)
    assert scanner.timeout_seconds == 45.0


async def test_clamav_scanner_reports_broken_stream_as_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    """Dropped clamd connections should produce a controlled fail-closed error."""

    class _BrokenStream:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args) -> None:  # noqa: ANN002
            del args

        async def send(self, data: bytes) -> None:
            del data
            raise anyio.BrokenResourceError

    async def _connect_tcp(host: str, port: int):  # noqa: ANN202
        assert host == "clamav"
        assert port == 3310
        return _BrokenStream()

    monkeypatch.setattr("app.api.file_storage.upload_security.anyio.connect_tcp", _connect_tcp)

    scanner = ClamAVScanner(host="clamav", port=3310, timeout_seconds=1)

    with pytest.raises(ServiceUnavailableError, match="Malware scanning is unavailable"):
        await scanner.scan(BytesIO(b"clean"))


def test_enabled_malware_scanning_requires_configuration(monkeypatch: pytest.MonkeyPatch) -> None:
    """Startup should fail closed when enabled upload scanning has no scanner host."""
    monkeypatch.setattr("app.api.file_storage.upload_security.settings.malware_scan_enabled", True)
    monkeypatch.setattr("app.api.file_storage.upload_security.settings.clamav_host", "")

    with pytest.raises(RuntimeError, match="Malware scanning is enabled"):
        validate_malware_scanner_configuration()


def test_disabled_malware_scanning_does_not_block_deployed_startup(monkeypatch: pytest.MonkeyPatch) -> None:
    """Existing deployments should not fail startup unless upload scanning is explicitly enabled."""
    monkeypatch.setattr("app.api.file_storage.upload_security.settings.malware_scan_enabled", False)
    monkeypatch.setattr("app.api.file_storage.upload_security.settings.clamav_host", "")

    validate_malware_scanner_configuration()
