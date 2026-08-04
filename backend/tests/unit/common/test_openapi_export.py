"""Tests for generated OpenAPI schema export tooling."""

import json
from typing import TYPE_CHECKING

from scripts.generate import export_openapi

if TYPE_CHECKING:
    from pathlib import Path

    import pytest


def _redirect_output_paths(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(export_openapi, "DOCS_SCHEMA_DIR", tmp_path)
    monkeypatch.setattr(export_openapi, "APP_SCHEMA_PATH", tmp_path / "openapi.json")


def test_export_openapi_schemas_writes_public_and_device_contracts(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The export helper should write deterministic docs schemas."""
    _redirect_output_paths(tmp_path, monkeypatch)

    export_openapi.export_openapi_schemas()

    public_schema = json.loads((tmp_path / "openapi.public.json").read_text(encoding="utf-8"))
    device_schema = json.loads((tmp_path / "openapi.device.json").read_text(encoding="utf-8"))

    assert public_schema["openapi"].startswith("3.")
    assert device_schema["openapi"].startswith("3.")
    assert "/v1/plugins/rpi-cam/pairing/register" in device_schema["paths"]


def test_public_schema_covers_routes_added_through_sub_routers(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Operations pulled in via ``include_router`` must inherit their parent's audience."""
    _redirect_output_paths(tmp_path, monkeypatch)

    export_openapi.export_openapi_schemas()

    public_paths = json.loads((tmp_path / "openapi.public.json").read_text(encoding="utf-8"))["paths"]

    assert {
        "/v1/auth/verify",
        "/v1/auth/forgot-password",
        "/v1/auth/reset-password",
        "/v1/auth/validate-email",
        "/v1/oauth/google/session/authorize",
        "/v1/users/me",
    } <= public_paths.keys()
    # A device sub-router mounted under a public prefix keeps its own audience.
    assert "/v1/plugins/rpi-cam/device/cameras/{camera_id}/image-upload" not in public_paths
    assert "/v1/admin/users" not in public_paths
    # fastapi-users' superuser-by-id routes are dropped from /users entirely;
    # by-id management lives on the audited /admin/users surface.
    assert "/v1/users/{id}" not in public_paths


def test_schemas_are_current_detects_stale_schema(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """The check helper should fail when any generated docs schema is stale."""
    _redirect_output_paths(tmp_path, monkeypatch)
    (tmp_path / "openapi.public.json").write_text('{"stale": true}\n', encoding="utf-8")

    assert not export_openapi.schemas_are_current()

    export_openapi.export_openapi_schemas()

    assert export_openapi.schemas_are_current()
