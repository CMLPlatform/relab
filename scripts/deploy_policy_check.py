#!/usr/bin/env python3
"""Validate RELab-specific rendered Compose policy.

Generic Dockerfile, GitHub Actions, dependency, and source-code checks belong
to Trivy, actionlint, Zizmor, dependency review, and CodeQL. Keep this script
focused on RELab invariants that only exist after Compose overlays are rendered:
network exposure, service isolation, runtime hardening, image pinning, and
secret access.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

LOCAL_IMAGE_PREFIXES = ("relab-",)
DEPLOY_ENVIRONMENTS = ("prod", "staging")
LOKI_POLICY_LABELS = ("prod-loki", "staging-loki")
DATA_ONLY_SERVICES = ("postgres", "redis")
HARDENED_RUNTIME_SERVICES = ("api", "migrator", "docs", "app", "www", "backup")


def load_json(path: Path) -> dict[str, Any]:
    """Load a JSON file as a dictionary."""
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def read_secret_manifest(path: Path) -> set[str]:
    """Read the secret manifest file, returning the set of expected secret names."""
    names: set[str] = set()
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if line and not line.startswith("#"):
            names.add(line)
    return names


def secret_sources(service_config: dict[str, Any]) -> set[str]:
    """Extract the set of secret sources used by a service, from both top-level and per-secret configuration."""
    sources: set[str] = set()
    for item in service_config.get("secrets") or []:
        if isinstance(item, str):
            sources.add(item)
        elif isinstance(item, dict) and "source" in item:
            sources.add(str(item["source"]))
    return sources


def service(config: dict[str, Any], name: str, label: str) -> dict[str, Any]:
    """Extract the configuration for a named service, or raise an error if it's missing."""
    services = config.get("services", {})
    if name not in services:
        msg = f"{label}: service '{name}' is missing"
        raise AssertionError(msg)
    return services[name]


def network_names(service_config: dict[str, Any]) -> set[str]:
    """Extract the set of network names joined by a service."""
    networks = service_config.get("networks") or {}
    if isinstance(networks, dict):
        return set(networks)
    return set(networks)


def image_tag(image: str) -> str | None:
    """Return the image tag, or None when the image uses Docker's implicit latest tag."""
    image_name = image.split("@", 1)[0]
    last_path_part = image_name.rsplit("/", 1)[-1]
    if ":" not in last_path_part:
        return None
    return last_path_part.rsplit(":", 1)[1]


def is_local_relab_image(image: str) -> bool:
    """Return whether an image is built locally by the RELab deploy stack."""
    image_name = image.split("/", 1)[0]
    return image_name.startswith(LOCAL_IMAGE_PREFIXES)


def assert_deploy_service_image_policy(service_config: dict[str, Any], label: str, service_name: str) -> None:
    """Assert that deploy service images are stable and pinned where needed."""
    image = str(service_config.get("image") or "")
    tag = image_tag(image)
    has_digest = "@sha256:" in image
    if tag == "latest" or (tag is None and not has_digest):
        msg = f"{label}: {service_name} must not use the latest image tag"
        raise AssertionError(msg)
    if not is_local_relab_image(image) and not has_digest:
        msg = f"{label}: {service_name} external image must be digest-pinned"
        raise AssertionError(msg)


def assert_no_host_ports(config: dict[str, Any], label: str, service_name: str) -> None:
    """Assert that the given service does not publish any host ports."""
    ports = service(config, service_name, label).get("ports") or []
    if ports:
        msg = f"{label}: {service_name} must not publish host ports"
        raise AssertionError(msg)


def assert_localhost_ports(config: dict[str, Any], label: str, service_name: str) -> None:
    """Assert that all published ports for the given service bind to localhost."""
    ports = service(config, service_name, label).get("ports") or []
    if not ports:
        msg = f"{label}: {service_name} should publish a localhost-only dev port"
        raise AssertionError(msg)
    assert_ports_bind_localhost(ports, label, service_name)


def assert_ports_bind_localhost(ports: list[dict[str, Any]], label: str, service_name: str) -> None:
    """Assert that all given ports bind to localhost."""
    for port in ports:
        host_ip = port.get("host_ip")
        if host_ip != "127.0.0.1":
            msg = f"{label}: {service_name} port {port!r} must bind to 127.0.0.1"
            raise AssertionError(msg)


def assert_all_published_ports_bind_localhost(config: dict[str, Any], label: str) -> None:
    """Assert that all published ports in the given config bind to localhost."""
    for service_name, service_config in (config.get("services") or {}).items():
        ports = service_config.get("ports") or []
        if ports:
            assert_ports_bind_localhost(ports, label, service_name)


def assert_networks(
    config: dict[str, Any], label: str, service_name: str, *, required: set[str], forbidden: set[str]
) -> None:
    """Assert that the given service joins all required networks and no forbidden networks."""
    names = network_names(service(config, service_name, label))
    missing = required - names
    unexpected = forbidden & names
    if missing:
        msg = f"{label}: {service_name} missing networks: {', '.join(sorted(missing))}"
        raise AssertionError(msg)
    if unexpected:
        msg = f"{label}: {service_name} must not join networks: {', '.join(sorted(unexpected))}"
        raise AssertionError(msg)


def assert_hardened_runtime_service(config: dict[str, Any], label: str, service_name: str) -> None:
    """Assert that the given service follows RELab runtime hardening policy."""
    service_config = service(config, service_name, label)
    cap_drop = service_config.get("cap_drop") or []
    security_opt = service_config.get("security_opt") or []
    ulimits = service_config.get("ulimits") or {}
    user = str(service_config.get("user") or "")

    if "ALL" not in cap_drop:
        msg = f"{label}: {service_name} must drop all Linux capabilities"
        raise AssertionError(msg)
    if "no-new-privileges:true" not in security_opt:
        msg = f"{label}: {service_name} must set no-new-privileges"
        raise AssertionError(msg)
    if int(service_config.get("pids_limit") or 0) <= 0:
        msg = f"{label}: {service_name} must set pids_limit"
        raise AssertionError(msg)
    if "nofile" not in ulimits:
        msg = f"{label}: {service_name} must set a nofile ulimit"
        raise AssertionError(msg)
    if service_config.get("read_only") is not True:
        msg = f"{label}: {service_name} must use a read-only root filesystem"
        raise AssertionError(msg)
    if not user or user == "0" or user.startswith(("0:", "root:")) or user == "root":
        msg = f"{label}: {service_name} must declare a non-root user"
        raise AssertionError(msg)


def assert_loki_logging_overlay(config: dict[str, Any], label: str) -> None:
    """Assert that every runtime service uses the Loki logging driver in the optional overlay."""
    for service_name, service_config in (config.get("services") or {}).items():
        logging_config = service_config.get("logging") or {}
        if logging_config.get("driver") != "loki":
            msg = f"{label}: {service_name} must use the loki logging driver"
            raise AssertionError(msg)


def check_compose_policy(compose_configs: dict[str, Path]) -> None:
    """Check that Compose configs follow RELab network and runtime policy."""
    configs = {label: load_json(path) for label, path in compose_configs.items()}

    dev = configs["dev"]
    if not (dev.get("networks", {}).get("data") or {}).get("internal"):
        msg = "dev: data network must be internal"
        raise AssertionError(msg)
    assert_all_published_ports_bind_localhost(dev, "dev")
    assert_localhost_ports(dev, "dev", "postgres")
    assert_localhost_ports(dev, "dev", "redis")

    e2e = configs["e2e"]
    assert_all_published_ports_bind_localhost(e2e, "e2e")

    for label in DEPLOY_ENVIRONMENTS:
        config = configs[label]
        if not (config.get("networks", {}).get("data") or {}).get("internal"):
            msg = f"{label}: data network must be internal"
            raise AssertionError(msg)
        for service_name in DATA_ONLY_SERVICES:
            assert_no_host_ports(config, label, service_name)
            assert_networks(config, label, service_name, required={"data"}, forbidden={"edge"})
        assert_networks(config, label, "backup", required={"data"}, forbidden={"edge"})
        assert_networks(config, label, "api", required={"edge", "data"}, forbidden=set())
        for service_name in config.get("services") or {}:
            assert_deploy_service_image_policy(service(config, service_name, label), label, service_name)
        for service_name in HARDENED_RUNTIME_SERVICES:
            assert_hardened_runtime_service(config, label, service_name)

    for label in LOKI_POLICY_LABELS:
        if label in configs:
            assert_loki_logging_overlay(configs[label], label)


def check_secrets(manifest: Path, compose_configs: dict[str, Path]) -> None:
    """Check that deploy secrets match the manifest and are correctly configured."""
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
            msg = f"{label}: deploy secrets do not match {manifest}: {'; '.join(details)}"
            raise AssertionError(msg)

        for name in expected:
            configured_file = Path(str(actual_secrets[name].get("file", "")))
            expected_file = (Path.cwd() / "secrets" / label / name).resolve()
            if configured_file != expected_file:
                msg = f"{label}: secret '{name}' must use {expected_file}, got {configured_file}"
                raise AssertionError(msg)

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
            "backup": {"database_backup_password", "restic_password"},
        }
        for service_name, required in required_by_service.items():
            sources = secret_sources(service(config, service_name, label))
            missing_service_secrets = required - sources
            unexpected = sources - required
            if missing_service_secrets:
                msg = f"{label}: {service_name} missing required secrets: {', '.join(sorted(missing_service_secrets))}"
                raise AssertionError(msg)
            if unexpected:
                msg = f"{label}: {service_name} has unexpected secret access: {', '.join(sorted(unexpected))}"
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
    """Validate RELab deploy secrets and Compose network policy."""
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
    except AssertionError:
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
