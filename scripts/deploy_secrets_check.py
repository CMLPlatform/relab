#!/usr/bin/env python3
"""Validate rendered Compose secret file paths."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def load_json(path: Path) -> dict[str, Any]:
    """Load a JSON file as a dictionary."""
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def compose_secret_names(config: dict[str, Any]) -> list[str]:
    """Return rendered top-level Compose secret names."""
    return sorted((config.get("secrets") or {}).keys())


def assert_secret_files(label: str, config: dict[str, Any]) -> None:
    """Assert rendered Compose secrets point at root secret files."""
    for name, secret_config in (config.get("secrets") or {}).items():
        configured_file = Path(str(secret_config.get("file", "")))
        expected_file = (Path.cwd() / "secrets" / label / name).resolve()
        if configured_file != expected_file:
            msg = f"{label}: secret '{name}' must use {expected_file}, got {configured_file}"
            raise AssertionError(msg)


def parse_labeled_paths(values: list[str]) -> dict[str, Path]:
    """Parse command-line arguments of the form LABEL=PATH."""
    parsed: dict[str, Path] = {}
    for value in values:
        if "=" not in value:
            msg = f"Expected LABEL=PATH argument, got: {value}"
            raise SystemExit(msg)
        label, path = value.split("=", 1)
        parsed[label] = Path(path)
    return parsed


def main() -> int:
    """Validate or list rendered Compose secret files."""
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    list_parser = subparsers.add_parser("list")
    list_parser.add_argument("config", type=Path, help="Compose config JSON file")

    check_parser = subparsers.add_parser("check")
    check_parser.add_argument("configs", nargs="+", help="Compose config JSON files as LABEL=PATH")

    args = parser.parse_args()

    try:
        if args.command == "list":
            for name in compose_secret_names(load_json(args.config)):
                sys.stdout.write(f"{name}\n")
        elif args.command == "check":
            for label, path in parse_labeled_paths(args.configs).items():
                assert_secret_files(label, load_json(path))
    except AssertionError as exc:
        sys.stderr.write(f"{exc}\n")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
