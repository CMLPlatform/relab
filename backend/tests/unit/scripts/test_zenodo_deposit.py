"""Unit tests for the Zenodo deposit script, with no network involved."""

from typing import TYPE_CHECKING, Any

import httpx
import pytest

from scripts import zenodo_deposit as zenodo
from scripts.zenodo_deposit import fetch_deposition, main, release_files, upload_files

if TYPE_CHECKING:
    from pathlib import Path

DROPPED = httpx.ConnectError("the connection dropped")


def _release_dir(tmp_path: Path) -> Path:
    """Return a directory holding the two files ``release_files`` insists on."""
    root = tmp_path / "release"
    root.mkdir()
    (root / "README.md").write_text("a release\n", encoding="utf-8")
    (root / "SHA256SUMS").write_text("abc  README.md\n", encoding="utf-8")
    return root


def test_release_files_refuses_a_directory_that_fails_verification(tmp_path, monkeypatch) -> None:
    """A published Zenodo file can never be changed, so the upload re-runs verification."""
    monkeypatch.setattr(zenodo, "verify", lambda _root: ["images/a.jpg: EXIF tag 0x8825 outside the allowlist"])
    with pytest.raises(SystemExit, match="refusing to upload"):
        release_files(_release_dir(tmp_path))


def test_release_files_returns_the_archive_when_verification_passes(tmp_path, monkeypatch) -> None:
    """A clean directory uploads, review extracts excluded as before."""
    monkeypatch.setattr(zenodo, "verify", lambda _root: [])
    root = _release_dir(tmp_path)
    names = sorted(path.name for path in release_files(root))
    assert names == ["README.md", "SHA256SUMS"]


def test_release_files_reports_a_missing_file_before_verifying(tmp_path, monkeypatch) -> None:
    """An incomplete directory gets the specific error, not a verification traceback."""
    monkeypatch.setattr(zenodo, "verify", lambda _root: [])
    root = tmp_path / "release"
    root.mkdir()
    with pytest.raises(SystemExit, match="Missing release files"):
        release_files(root)


def test_upload_retries_a_dropped_connection(tmp_path, monkeypatch) -> None:
    """A part-uploaded release is worse than a failed one, so a flaky PUT is retried."""
    monkeypatch.setattr(zenodo.time, "sleep", lambda _seconds: None)
    attempts = []

    def handler(request: httpx.Request) -> httpx.Response:
        attempts.append(request.url.path)
        if len(attempts) < zenodo.UPLOAD_ATTEMPTS:
            raise DROPPED
        return httpx.Response(201, json={})

    path = tmp_path / "records.parquet"
    path.write_bytes(b"data")
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        upload_files(client, "https://zenodo.test/bucket", tmp_path, [path])
    assert len(attempts) == zenodo.UPLOAD_ATTEMPTS


def test_upload_gives_up_after_the_last_attempt(tmp_path) -> None:
    """Retrying forever would hide a broken token or a deleted bucket."""

    def handler(_request: httpx.Request) -> httpx.Response:
        raise DROPPED

    path = tmp_path / "records.parquet"
    path.write_bytes(b"data")
    with (
        httpx.Client(transport=httpx.MockTransport(handler)) as client,
        pytest.raises(httpx.ConnectError),
    ):
        upload_files(client, "https://zenodo.test/bucket", tmp_path, [path])


def test_fetch_deposition_reads_an_existing_draft() -> None:
    """Reusing a draft's bucket is what stops a retried run leaving orphan drafts behind."""
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        return httpx.Response(200, json={"id": 42, "links": {"bucket": "https://zenodo.test/bucket"}})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        deposition = fetch_deposition(client, "https://zenodo.test/api", 42)
    assert seen == ["/api/deposit/depositions/42"]
    assert deposition["links"]["bucket"] == "https://zenodo.test/bucket"


def test_deposition_flag_uploads_into_the_named_draft(tmp_path, monkeypatch) -> None:
    """--deposition without --publish reuses that draft instead of creating another."""
    captured: dict[str, Any] = {}
    monkeypatch.setattr(zenodo, "deposit", lambda *_args, **kwargs: captured.update(kwargs))
    monkeypatch.setattr("sys.argv", ["zenodo_deposit", "--dir", str(tmp_path), "--deposition", "42"])
    main()
    assert captured["deposition_id"] == 42
