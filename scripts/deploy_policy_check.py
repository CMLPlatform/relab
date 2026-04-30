#!/usr/bin/env python3
"""Validate RELab deploy secrets and Compose network policy."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def load_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def read_secret_manifest(path: Path) -> set[str]:
    names: set[str] = set()
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if line and not line.startswith("#"):
            names.add(line)
    return names


def secret_sources(service_config: dict[str, Any]) -> set[str]:
    sources: set[str] = set()
    for item in service_config.get("secrets") or []:
        if isinstance(item, str):
            sources.add(item)
        elif isinstance(item, dict) and "source" in item:
            sources.add(str(item["source"]))
    return sources


def service(config: dict[str, Any], name: str, label: str) -> dict[str, Any]:
    services = config.get("services", {})
    if name not in services:
        raise AssertionError(f"{label}: service '{name}' is missing")
    return services[name]


def network_names(service_config: dict[str, Any]) -> set[str]:
    networks = service_config.get("networks") or {}
    if isinstance(networks, dict):
        return set(networks)
    return set(networks)


def assert_no_host_ports(config: dict[str, Any], label: str, service_name: str) -> None:
    ports = service(config, service_name, label).get("ports") or []
    if ports:
        raise AssertionError(f"{label}: {service_name} must not publish host ports")


def assert_localhost_ports(config: dict[str, Any], label: str, service_name: str) -> None:
    ports = service(config, service_name, label).get("ports") or []
    if not ports:
        raise AssertionError(f"{label}: {service_name} should publish a localhost-only dev port")
    for port in ports:
        host_ip = port.get("host_ip")
        if host_ip != "127.0.0.1":
            raise AssertionError(f"{label}: {service_name} port {port!r} must bind to 127.0.0.1")


def assert_networks(
    config: dict[str, Any],
    label: str,
    service_name: str,
    *,
    required: set[str],
    forbidden: set[str],
) -> None:
    names = network_names(service(config, service_name, label))
    missing = required - names
    unexpected = forbidden & names
    if missing:
        raise AssertionError(f"{label}: {service_name} missing networks: {', '.join(sorted(missing))}")
    if unexpected:
        raise AssertionError(f"{label}: {service_name} must not join networks: {', '.join(sorted(unexpected))}")


def check_compose_policy(compose_configs: dict[str, Path]) -> None:
    configs = {label: load_json(path) for label, path in compose_configs.items()}

    dev = configs["dev"]
    if not (dev.get("networks", {}).get("data") or {}).get("internal"):
        raise AssertionError("dev: data network must be internal")
    assert_localhost_ports(dev, "dev", "postgres")
    assert_localhost_ports(dev, "dev", "redis")

    for label in ("prod", "staging"):
        config = configs[label]
        if not (config.get("networks", {}).get("data") or {}).get("internal"):
            raise AssertionError(f"{label}: data network must be internal")
        for service_name in ("postgres", "redis"):
            assert_no_host_ports(config, label, service_name)
            assert_networks(config, label, service_name, required={"data"}, forbidden={"edge"})
        assert_networks(config, label, "relab-backup", required={"data"}, forbidden={"edge"})
        assert_networks(config, label, "api", required={"edge", "data"}, forbidden=set())


def check_secrets(manifest: Path, compose_configs: dict[str, Path]) -> None:
    expected = read_secret_manifest(manifest)
    for label, path in compose_configs.items():
        config = load_json(path)
        actual_secrets = config.get("secrets") or {}
        actual = set(actual_secrets)
        missing = expected - actual
        extra = actual - expected
        if missing or extra:
            details: list[str] = []
            if missing:
                details.append(f"missing: {', '.join(sorted(missing))}")
            if extra:
                details.append(f"unexpected: {', '.join(sorted(extra))}")
            raise AssertionError(f"{label}: deploy secrets do not match {manifest}: {'; '.join(details)}")

        for name in expected:
            configured_file = Path(str(actual_secrets[name].get("file", "")))
            expected_file = (Path.cwd() / "secrets" / label / name).resolve()
            if configured_file != expected_file:
                raise AssertionError(
                    f"{label}: secret '{name}' must use {expected_file}, got {configured_file}"
                )

        required_by_service = {
            "api": {
                "database_app_password",
                "database_migration_password",
                "database_backup_password",
                "redis_password",
            },
            "migrator": {
                "database_app_password",
                "database_migration_password",
                "database_backup_password",
                "redis_password",
            },
            "postgres": {
                "postgres_password",
                "database_app_password",
                "database_migration_password",
                "database_backup_password",
            },
            "redis": {"redis_password"},
            "relab-backup": {"database_backup_password", "restic_password"},
        }
        for service_name, required in required_by_service.items():
            sources = secret_sources(service(config, service_name, label))
            missing_service_secrets = required - sources
            unexpected = sources - required
            if missing_service_secrets:
                raise AssertionError(
                    f"{label}: {service_name} missing required secrets: "
                    f"{', '.join(sorted(missing_service_secrets))}"
                )
            if unexpected:
                raise AssertionError(
                    f"{label}: {service_name} has unexpected secret access: {', '.join(sorted(unexpected))}"
                )


def parse_labeled_paths(values: list[str]) -> dict[str, Path]:
    parsed: dict[str, Path] = {}
    for value in values:
        if "=" not in value:
            raise SystemExit(f"Expected LABEL=PATH argument, got: {value}")
        label, path = value.split("=", 1)
        parsed[label] = Path(path)
    return parsed


def main() -> int:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    compose_parser = subparsers.add_parser("compose")
    compose_parser.add_argument("configs", nargs="+", help="Compose config JSON files as LABEL=PATH")

    secrets_parser = subparsers.add_parser("secrets")
    secrets_parser.add_argument("--manifest", required=True, type=Path)
    secrets_parser.add_argument("configs", nargs="+", help="Compose config JSON files as LABEL=PATH")

    args = parser.parse_args()

    try:
        configs = parse_labeled_paths(args.configs)
        if args.command == "compose":
            check_compose_policy(configs)
        elif args.command == "secrets":
            check_secrets(args.manifest, configs)
    except AssertionError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
