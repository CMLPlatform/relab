"""Tests for generated OpenAPI schema export tooling."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

from scripts.generate.export_openapi import export_openapi_schemas, schemas_are_current

if TYPE_CHECKING:
    from pathlib import Path


def test_export_openapi_schemas_writes_public_and_device_contracts(tmp_path: Path) -> None:
    """The export helper should write deterministic docs schemas."""
    export_openapi_schemas(tmp_path)

    public_schema = json.loads((tmp_path / "openapi.public.json").read_text(encoding="utf-8"))
    device_schema = json.loads((tmp_path / "openapi.device.json").read_text(encoding="utf-8"))

    assert public_schema["openapi"].startswith("3.")
    assert device_schema["openapi"].startswith("3.")
    assert "/v1/plugins/rpi-cam/pairing/register" in device_schema["paths"]


def test_schemas_are_current_detects_stale_schema(tmp_path: Path) -> None:
    """The check helper should fail when any generated docs schema is stale."""
    tmp_path.mkdir(exist_ok=True)
    (tmp_path / "openapi.public.json").write_text('{"stale": true}\n', encoding="utf-8")

    assert not schemas_are_current(tmp_path)

    export_openapi_schemas(tmp_path)

    assert schemas_are_current(tmp_path)
