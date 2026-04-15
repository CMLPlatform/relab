#!/usr/bin/env python3
"""Validate small, durable infra contracts for the repo."""

from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def require_file(relative_path: str) -> None:
    path = ROOT / relative_path
    if not path.exists():
        raise SystemExit(f"missing required infra file: {relative_path}")


def require_text(path: Path, expected: str) -> None:
    text = path.read_text()
    if expected not in text:
        raise SystemExit(f"{path.relative_to(ROOT)}: expected to contain {expected!r}")


def require_service_names() -> None:
    compose_text = "\n".join(path.read_text() for path in ROOT.glob("compose*.yml"))
    for service_name in (
        "api:",
        "migrator:",
        "redis:",
        "postgres:",
        "docs-site:",
        "app-site:",
        "web-site:",
        "uploads-backup:",
        "postgres-backup:",
    ):
        if service_name not in compose_text:
            raise SystemExit(f"compose files: expected service {service_name.removesuffix(':')}")


def require_root_recipes() -> None:
    output = subprocess.run(
        ["just", "--list"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    for recipe in (
        "setup",
        "install",
        "update",
        "validate",
        "test",
        "test-integration",
        "security",
        "env-audit",
        "release-check",
        "compose-config",
        "dev",
        "dev-up",
        "dev-down",
        "dev-logs",
        "dev-migrate",
        "docker-smoke",
        "docker-ci-perf-baseline",
        "prod-build",
        "prod-up",
        "prod-down",
        "prod-logs",
        "prod-migrate",
        "staging-build",
        "staging-up",
        "staging-down",
        "staging-logs",
        "staging-migrate",
    ):
        if f"    {recipe}" not in output:
            raise SystemExit(f"just --list: expected public recipe {recipe}")


def main() -> None:
    for path in (
        "compose.yml",
        "compose.dev.yml",
        "compose.test.yml",
        "compose.staging.yml",
        "compose.prod.yml",
        "backend/.env.staging.example",
        "backend/.env.prod.example",
    ):
        require_file(path)

    workflow_names = {
        ".github/workflows/validate.yml": "name: Validate",
        ".github/workflows/security.yml": "name: Security",
        ".github/workflows/release.yml": "name: Release Please",
        ".github/workflows/ops.yml": "name: Ops",
    }
    for relative_path, expected in workflow_names.items():
        require_text(ROOT / relative_path, expected)

    require_service_names()
    require_root_recipes()
    print("infra contracts are internally consistent")


if __name__ == "__main__":
    main()
