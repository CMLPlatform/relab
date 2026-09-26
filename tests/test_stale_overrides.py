"""Checks scripts/stale_overrides.py: which override lines it tests, and how it reads the audit."""

from __future__ import annotations

import subprocess
from typing import TYPE_CHECKING

import pytest
import stale_overrides

if TYPE_CHECKING:
    from pathlib import Path

WORKSPACE = """\
catalog:
  "x@<1": "1" # GHSA-not-an-override
overrides:
  # comment
  "uuid@<11.1.1": ">=11.1.1" # GHSA-w5hq-g745-h8pq
  "@ai-sdk/provider-utils@>=4.0.0 <4.0.33": ">=4.0.33 <5" # GHSA-866g-f22w-33x8
  monaco-editor@0.55.1>dompurify: 3.4.15 # GHSA-xxxx-xxxx-xxxx
  lightningcss: 1.33.0
"""


def test_selects_only_ghsa_tagged_override_lines() -> None:
    packages = [package for _, package in stale_overrides.security_overrides(WORKSPACE)]
    assert packages == ["uuid", "@ai-sdk/provider-utils", "dompurify"]


def _run_check(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, audit_stdout: str) -> tuple[int, list[str]]:
    """Run main() against temp files with pnpm stubbed; return exit code and workspaces audited."""
    workspace = tmp_path / "pnpm-workspace.yaml"
    lockfile = tmp_path / "pnpm-lock.yaml"
    workspace.write_text(WORKSPACE_WITH_IGNORES)
    lockfile.write_text("lock")
    monkeypatch.setattr(stale_overrides, "WORKSPACE", workspace)
    monkeypatch.setattr(stale_overrides, "LOCKFILE", lockfile)
    audited: list[str] = []

    def fake_run(argv: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        if argv[1] == "audit":
            audited.append(workspace.read_text())
        return subprocess.CompletedProcess(argv, 1, stdout=audit_stdout, stderr="boom")

    monkeypatch.setattr(stale_overrides.subprocess, "run", fake_run)
    try:
        return stale_overrides.main(), audited
    finally:
        assert workspace.read_text() == WORKSPACE_WITH_IGNORES
        assert lockfile.read_text() == "lock"


WORKSPACE_WITH_IGNORES = """\
auditConfig:
  ignoreGhsas:
    - GHSA-w5hq-g745-h8pq # listed here too
overrides:
  "uuid@<11.1.1": ">=11.1.1" # GHSA-w5hq-g745-h8pq
"""


def test_clean_audit_marks_stale_with_ignores_cleared(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    code, audited = _run_check(tmp_path, monkeypatch, '{"advisories": {}, "metadata": {}}')
    assert code == 1
    assert "GHSA-w5hq" not in audited[0]


def test_flagged_package_keeps_override(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    payload = '{"advisories": {"1": {"module_name": "uuid"}}, "metadata": {}}'
    assert _run_check(tmp_path, monkeypatch, payload)[0] == 0


def test_errored_audit_raises_instead_of_reporting_stale(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(SystemExit, match="boom"):
        _run_check(tmp_path, monkeypatch, '{"error": {"code": "ERR_PNPM_AUDIT_BAD_RESPONSE"}}')
