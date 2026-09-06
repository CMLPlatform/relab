"""Tests for generated OpenAPI schema export tooling."""

import json
import shutil
from typing import TYPE_CHECKING

import pytest

from scripts.generate import export_openapi

if TYPE_CHECKING:
    from pathlib import Path


def _redirect_output_paths(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(export_openapi, "DOCS_SCHEMA_DIR", tmp_path)
    monkeypatch.setattr(export_openapi, "APP_SCHEMA_PATH", tmp_path / "openapi.json")


@pytest.fixture(scope="module")
def exported_schemas(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Export the schemas once for the tests that only read the result.

    Each export builds all three contracts off the full app, so re-running it per
    test dominated this module's runtime.
    """
    directory = tmp_path_factory.mktemp("openapi")
    with pytest.MonkeyPatch.context() as monkeypatch:
        _redirect_output_paths(directory, monkeypatch)
        export_openapi.export_openapi_schemas()
    return directory


def test_export_openapi_schemas_writes_public_and_device_contracts(exported_schemas: Path) -> None:
    """The export helper should write deterministic docs schemas."""
    public_schema = json.loads((exported_schemas / "openapi.public.json").read_text(encoding="utf-8"))
    device_schema = json.loads((exported_schemas / "openapi.device.json").read_text(encoding="utf-8"))

    assert public_schema["openapi"].startswith("3.")
    assert device_schema["openapi"].startswith("3.")
    assert "/v1/plugins/rpi-cam/pairing/register" in device_schema["paths"]


def test_public_schema_covers_routes_added_through_sub_routers(exported_schemas: Path) -> None:
    """Operations pulled in via ``include_router`` must inherit their parent's audience."""
    public_paths = json.loads((exported_schemas / "openapi.public.json").read_text(encoding="utf-8"))["paths"]

    assert {
        "/v1/auth/verify",
        "/v1/auth/forgot-password",
        "/v1/auth/reset-password",
        "/v1/auth/validate-email",
        "/v1/oauth/google/session/authorize",
        "/v1/users/me",
        "/v1/plugins/rpi-cam/pairing/claim",
    } <= public_paths.keys()
    # A device sub-router mounted under a public prefix keeps its own audience.
    assert "/v1/plugins/rpi-cam/device/cameras/{camera_id}/image-upload" not in public_paths
    assert "/v1/admin/users" not in public_paths
    # fastapi-users' superuser-by-id routes are dropped from /users entirely;
    # by-id management lives on the audited /admin/users surface.
    assert "/v1/users/{id}" not in public_paths
    # register/poll are Pi-only; they must not leak into the app-facing public schema,
    # even though they share a path prefix with the user-facing claim endpoint.
    assert "/v1/plugins/rpi-cam/pairing/register" not in public_paths
    assert "/v1/plugins/rpi-cam/pairing/poll" not in public_paths


def test_device_schema_covers_pairing_register_and_poll_only(exported_schemas: Path) -> None:
    """Pairing register/poll are device-only; claim (user-initiated) must not be there."""
    device_paths = json.loads((exported_schemas / "openapi.device.json").read_text(encoding="utf-8"))["paths"]

    assert "/v1/plugins/rpi-cam/pairing/register" in device_paths
    assert "/v1/plugins/rpi-cam/pairing/poll" in device_paths
    assert "/v1/plugins/rpi-cam/pairing/claim" not in device_paths


def test_schemas_are_current_detects_stale_schema(
    exported_schemas: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The check helper should accept a fresh export and reject a stale one."""
    schemas = tmp_path / "schemas"
    shutil.copytree(exported_schemas, schemas)
    _redirect_output_paths(schemas, monkeypatch)

    assert export_openapi.schemas_are_current()

    (schemas / "openapi.public.json").write_text('{"stale": true}\n', encoding="utf-8")

    assert not export_openapi.schemas_are_current()
