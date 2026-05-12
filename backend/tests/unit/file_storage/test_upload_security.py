"""Tests for ASVS V5 upload quota and malware scanning controls."""
# spell-checker: ignore clamav EICAR

from __future__ import annotations

from io import BytesIO
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import UploadFile

from app.api.common.exceptions import PayloadTooLargeError, ServiceUnavailableError
from app.api.file_storage.upload_security import (
    MalwareDetectedError,
    UploadQuotaSnapshot,
    _product_upload_quota_snapshot,
    enforce_upload_quota,
    malware_scanning_required,
    scan_upload_or_raise,
    validate_malware_scanner_configuration,
)
from app.core.config.models import Environment


def _upload(content: bytes = b"clean") -> UploadFile:
    return UploadFile(filename="manual.pdf", file=BytesIO(content), size=len(content))


def test_upload_quota_allows_files_below_count_and_byte_limits() -> None:
    """A new upload below both per-user quota dimensions is accepted."""
    enforce_upload_quota(
        UploadQuotaSnapshot(file_count=9, total_bytes=900),
        upload_size_bytes=99,
        max_files=10,
        max_total_bytes=1000,
        quota_user_id=uuid4(),
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
            quota_user_id=uuid4(),
        )


async def test_product_upload_quota_snapshot_joins_product_ownership(mock_session: AsyncMock) -> None:
    """Quota accounting should derive ownership from product rows, not media rows."""
    first_result = MagicMock()
    first_result.one.return_value = (2, 300)
    second_result = MagicMock()
    second_result.one.return_value = (1, 700)
    mock_session.execute.side_effect = [first_result, second_result]

    snapshot = await _product_upload_quota_snapshot(mock_session, uuid4())

    assert snapshot.file_count == 3
    assert snapshot.total_bytes == 1000
    assert mock_session.execute.await_count == 2
    rendered_statements = "\n".join(str(call.args[0]) for call in mock_session.execute.await_args_list)
    assert "JOIN product" in rendered_statements
    assert "product.owner_id" in rendered_statements
    assert "upload_size_bytes" in rendered_statements


async def test_optional_scanner_none_accepts_uploads() -> None:
    """The dev/test no-op path should leave clean uploads readable from the start."""
    upload = _upload()

    await scan_upload_or_raise(upload, scanner=None, required=False)

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

    await scan_upload_or_raise(upload, scanner=_CleanScanner(), required=True)

    assert upload.file.tell() == 0


async def test_scan_upload_rejects_infected_files() -> None:
    """Scanner detections must reject uploads before storage."""
    with pytest.raises(MalwareDetectedError, match="malicious"):
        await scan_upload_or_raise(_upload(), scanner=_InfectedScanner(), required=True)


async def test_scan_upload_fails_closed_when_required_scanner_is_unavailable() -> None:
    """Production scanning must fail closed when no scanner is available."""
    with pytest.raises(ServiceUnavailableError, match="Malware scanning is unavailable"):
        await scan_upload_or_raise(_upload(), scanner=None, required=True)


@pytest.mark.parametrize("environment", [Environment.STAGING, Environment.PROD])
def test_malware_scanning_is_opt_in_for_deployed_environments(environment: Environment) -> None:
    """Deployments may opt into malware scanning without making startup depend on ClamAV by default."""
    assert malware_scanning_required(environment=environment, enabled=False) is False
    assert malware_scanning_required(environment=environment, enabled=True) is True


def test_enabled_malware_scanning_requires_configuration(monkeypatch: pytest.MonkeyPatch) -> None:
    """Startup should fail closed when enabled upload scanning has no scanner host."""
    monkeypatch.setattr("app.api.file_storage.upload_security.settings.environment", Environment.PROD)
    monkeypatch.setattr("app.api.file_storage.upload_security.settings.malware_scan_enabled", True)
    monkeypatch.setattr("app.api.file_storage.upload_security.settings.clamav_host", "")

    with pytest.raises(RuntimeError, match="Malware scanning is enabled"):
        validate_malware_scanner_configuration()


def test_disabled_malware_scanning_does_not_block_deployed_startup(monkeypatch: pytest.MonkeyPatch) -> None:
    """Existing deployments should not fail startup unless upload scanning is explicitly enabled."""
    monkeypatch.setattr("app.api.file_storage.upload_security.settings.environment", Environment.PROD)
    monkeypatch.setattr("app.api.file_storage.upload_security.settings.malware_scan_enabled", False)
    monkeypatch.setattr("app.api.file_storage.upload_security.settings.clamav_host", "")

    validate_malware_scanner_configuration()
