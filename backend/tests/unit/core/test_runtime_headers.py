"""Tests for backend runtime HTTP header hardening."""

from __future__ import annotations

from pathlib import Path


def test_runtime_uvicorn_disables_server_header() -> None:
    """The production runtime should avoid emitting a fingerprinting Server header."""
    dockerfile = Path("Dockerfile").read_text(encoding="utf-8")

    runtime_cmd = dockerfile.rsplit("CMD ", maxsplit=1)[-1]

    assert "--no-server-header" in runtime_cmd


def test_runtime_uvicorn_sets_websocket_resource_limits() -> None:
    """The production runtime should bound WebSocket payloads and disable compression."""
    dockerfile = Path("Dockerfile").read_text(encoding="utf-8")

    runtime_cmd = dockerfile.rsplit("CMD ", maxsplit=1)[-1]

    assert "--ws-max-size ${RPI_CAM_WS_BINARY_FRAME_LIMIT_BYTES:-10485760}" in runtime_cmd
    assert "--ws-max-queue ${UVICORN_WS_MAX_QUEUE:-8}" in runtime_cmd
    assert "--ws-per-message-deflate false" in runtime_cmd
