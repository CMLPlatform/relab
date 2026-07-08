"""Export generated backend OpenAPI schemas for the docs site and app codegen."""

import argparse
import json
from pathlib import Path

from app.api.common.routers.openapi import build_device_openapi, build_public_openapi
from app.main import app

# Anchor outputs to the repo root (…/backend/scripts/generate/export_openapi.py),
# not the CWD, so --check doesn't false-drift when run from outside backend/.
_REPO_ROOT = Path(__file__).resolve().parents[3]
DOCS_SCHEMA_DIR = _REPO_ROOT / "docs" / "public" / "api" / "schemas"
APP_SCHEMA_PATH = _REPO_ROOT / "app" / "src" / "types" / "openapi.json"


def _pretty(schema: dict[str, object]) -> str:
    return f"{json.dumps(schema, indent=2, sort_keys=True)}\n"


def _compact(schema: dict[str, object]) -> str:
    return f"{json.dumps(schema, separators=(',', ':'))}\n"


def _expected_schemas() -> dict[Path, str]:
    """Map each output path to its expected serialized schema."""
    return {
        # Audience-filtered schemas published by the docs site (sorted for stable diffs).
        DOCS_SCHEMA_DIR / "openapi.public.json": _pretty(build_public_openapi(app)),
        DOCS_SCHEMA_DIR / "openapi.device.json": _pretty(build_device_openapi(app)),
        # Canonical schema the app's TypeScript codegen consumes. Machine-managed,
        # so it's stored compact (kept under the large-file limit) in route order
        # (matching the live /openapi.json) so api.generated.ts stays stable.
        APP_SCHEMA_PATH: _compact(app.openapi()),
    }


def export_openapi_schemas() -> None:
    """Write the current backend OpenAPI schemas to their output paths."""
    for path, content in _expected_schemas().items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")


def schemas_are_current() -> bool:
    """Return whether all generated schema files are current."""
    return all(
        path.exists() and path.read_text(encoding="utf-8") == expected_content
        for path, expected_content in _expected_schemas().items()
    )


def main() -> int:
    """Command-line entry point for export and drift checks."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if generated schemas are stale.")
    args = parser.parse_args()

    if args.check:
        return 0 if schemas_are_current() else 1

    export_openapi_schemas()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
