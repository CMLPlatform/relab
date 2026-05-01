"""Tests for backend runtime HTTP header hardening."""

from __future__ import annotations

from pathlib import Path


def test_runtime_uvicorn_disables_server_header() -> None:
    """The production runtime should avoid emitting a fingerprinting Server header."""
    dockerfile = Path("Dockerfile").read_text(encoding="utf-8")

    runtime_cmd = dockerfile.rsplit("CMD ", maxsplit=1)[-1]

    assert "--no-server-header" in runtime_cmd
