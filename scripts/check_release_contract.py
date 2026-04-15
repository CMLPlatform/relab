#!/usr/bin/env python3
"""Validate release metadata stays aligned across repo manifests."""

from __future__ import annotations

import json
import tomllib
from pathlib import Path


def read_python_project_version(path: Path) -> str:
    data = tomllib.loads(path.read_text())
    return data["project"]["version"]


def read_package_version(path: Path) -> str:
    return json.loads(path.read_text())["version"]


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    root_version = read_python_project_version(root / "pyproject.toml")
    versions = {
        "root": root_version,
        "backend": read_python_project_version(root / "backend/pyproject.toml"),
        "docs": read_python_project_version(root / "docs/pyproject.toml"),
        "frontend-app": read_package_version(root / "frontend-app/package.json"),
        "frontend-web": read_package_version(root / "frontend-web/package.json"),
        "release-please-manifest": json.loads((root / ".github/.release-please-manifest.json").read_text())["."],
    }
    mismatched = {
        name: version
        for name, version in versions.items()
        if version != root_version
    }
    if mismatched:
        mismatch_text = ", ".join(f"{name}={version}" for name, version in mismatched.items())
        raise SystemExit(
            f"Release metadata is out of sync with root version {root_version}: {mismatch_text}"
        )
    print(f"✓ Release metadata consistent at version {root_version}")


if __name__ == "__main__":
    main()
