"""Export generated backend OpenAPI schemas for the docs site."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.api.common.routers.openapi import build_device_openapi, build_public_openapi
from app.main import app

DEFAULT_OUTPUT_DIR = Path("../docs/public/api/schemas")
SCHEMA_BUILDERS = {
    "openapi.public.json": build_public_openapi,
    "openapi.device.json": build_device_openapi,
}


def _schema_text(schema: dict[str, object]) -> str:
    return f"{json.dumps(schema, indent=2, sort_keys=True)}\n"


def _expected_schemas() -> dict[str, str]:
    return {filename: _schema_text(builder(app)) for filename, builder in SCHEMA_BUILDERS.items()}


def export_openapi_schemas(output_dir: Path = DEFAULT_OUTPUT_DIR) -> None:
    """Write the current backend OpenAPI schemas to ``output_dir``."""
    output_dir.mkdir(parents=True, exist_ok=True)
    for filename, content in _expected_schemas().items():
        (output_dir / filename).write_text(content, encoding="utf-8")


def schemas_are_current(output_dir: Path = DEFAULT_OUTPUT_DIR) -> bool:
    """Return whether generated schema files in ``output_dir`` are current."""
    for filename, expected_content in _expected_schemas().items():
        path = output_dir / filename
        if not path.exists() or path.read_text(encoding="utf-8") != expected_content:
            return False
    return True


def main() -> int:
    """Command-line entry point for export and drift checks."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Directory for generated schemas. Defaults to {DEFAULT_OUTPUT_DIR}.",
    )
    parser.add_argument("--check", action="store_true", help="Fail if generated schemas are stale.")
    args = parser.parse_args()

    if args.check:
        return 0 if schemas_are_current(args.output_dir) else 1

    export_openapi_schemas(args.output_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
