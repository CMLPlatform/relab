#!/usr/bin/env python3
"""Validate root env policy and rendered Compose secret paths.

This script owns repo-wide configuration policy checks. Shell deploy scripts own
operator workflows and call this script when they need structured env/JSON
validation.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import tomllib
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SECRET_INVENTORY_FILE = ROOT / "deploy" / "env" / "variables.toml"

DEPLOY_ENV_FILES = (
    ROOT / "deploy" / "env" / "staging.compose.env",
    ROOT / "deploy" / "env" / "prod.compose.env",
)
COMMITTED_DEPLOY_ENV_NAMES = {
    "ENVIRONMENT",
    "API_PUBLIC_URL",
    "APP_PUBLIC_URL",
    "SITE_PUBLIC_URL",
    "DOCS_PUBLIC_URL",
}
REQUIRED_ROOT_OPERATOR_INPUT_NAMES = {
    "CLOUDFLARE_TUNNEL_TOKEN",
    "GOOGLE_OAUTH_CLIENT_ID",
    "GITHUB_OAUTH_CLIENT_ID",
    "EMAIL_PROVIDER",
    "EMAIL_FROM",
    "EMAIL_REPLY_TO",
    "BOOTSTRAP_SUPERUSER_EMAIL",
}
OPTIONAL_ROOT_OPERATOR_INPUT_NAMES = {
    "MICROSOFT_GRAPH_TENANT_ID",
    "MICROSOFT_GRAPH_CLIENT_ID",
    "MICROSOFT_GRAPH_SENDER_USER",
    "LOKI_PUSH_URL",
    "OTEL_EXPORTER_OTLP_ENDPOINT",
    "OTEL_EXPORTER_OTLP_HEADERS",
    "BACKUP_HOST_DIR",
}
STALE_ENV_NAMES = {
    "API_ORIGIN",
    "APP_ENV",
    "APP_ORIGIN",
    "BUILD_MODE",
    "COMPOSE_PROJECT_NAME",
    "CSP_API_ORIGIN",
    "DOCS_ORIGIN",
    "OAUTH_ALLOWED_REDIRECT_URIS",
    "MICROSOFT_GRAPH_SAVE_TO_SENT_ITEMS",
    "BOOTSTRAP_SUPERUSER_NAME",
    "BACKUP_INTERVAL_SECONDS",
    "RESTIC_KEEP_HOURLY",
    "RESTIC_KEEP_DAILY",
    "RESTIC_KEEP_WEEKLY",
    "RESTIC_KEEP_MONTHLY",
    "WEB_PUBLIC_URL",
    "WEB_ORIGIN",
    "WEB_CONCURRENCY",
}
SERVICE_BOUNDARY_URL_NAMES = {
    "BACKEND_API_URL",
    "CADDY_API_ORIGIN",
    "DOCS_URL",
    "EXPO_PUBLIC_API_URL",
    "EXPO_PUBLIC_DOCS_URL",
    "EXPO_PUBLIC_WEBSITE_URL",
    "FRONTEND_APP_URL",
    "FRONTEND_WEB_URL",
    "PUBLIC_APP_URL",
    "PUBLIC_BACKEND_API_URL",
    "PUBLIC_DOCS_URL",
    "PUBLIC_SITE_URL",
    "SITE_URL",
}
REMOVED_DEPLOY_ENV_FILES = {
    ROOT / "app" / ".env.prod",
    ROOT / "app" / ".env.staging",
    ROOT / "app" / ".env.test",
    ROOT / "backend" / (".env.dev" + ".example"),
    ROOT / "backend" / ".env.prod.example",
    ROOT / "backend" / ".env.staging.example",
    ROOT / "deploy" / "env" / "dev.compose.env",
    ROOT / "www" / ".env.dev",
    ROOT / "www" / ".env.prod",
    ROOT / "www" / ".env.staging",
    ROOT / "www" / ".env.test",
}
HIDDEN_PROD_DEFAULT_PATTERNS = {
    "CADDY_API_ORIGIN=https://api.cml-relab.org",
    "{$CADDY_API_ORIGIN:https://api.cml-relab.org}",
}
RUNTIME_CONFIG_FILES = (
    ROOT / "app" / "Dockerfile",
    ROOT / "app" / "Caddyfile",
    ROOT / "docs" / "Dockerfile",
    ROOT / "docs" / "Caddyfile",
    ROOT / "www" / "Dockerfile",
    ROOT / "www" / "Caddyfile",
)
FORBIDDEN_INFRA_DIRECTORIES = {
    ROOT / "infra" / "telemetry": "central telemetry stack IaC belongs in the central telemetry repository",
}


def _as_string_set(raw_values: object, name: str) -> set[str]:
    """Parse a TOML list of strings as a set."""
    if not isinstance(raw_values, list):
        msg = f"{SECRET_INVENTORY_FILE}: env_policy.{name} must be a list of strings"
        raise TypeError(msg)

    values: list[str] = []
    for value in raw_values:
        if not isinstance(value, str):
            msg = f"{SECRET_INVENTORY_FILE}: env_policy.{name} must be a list of strings"
            raise TypeError(msg)
        values.append(value)
    return set(values)


def load_secret_inventory(path: Path = SECRET_INVENTORY_FILE) -> dict[str, Any]:
    """Load RELab's compact provider-neutral secret inventory."""
    with path.open("rb") as f:
        raw = tomllib.load(f)

    policy = raw.get("env_policy")
    if not isinstance(policy, dict):
        msg = f"{path}: missing [env_policy] table"
        raise TypeError(msg)

    return {
        "runtime_secret_files": _as_string_set(policy.get("runtime_secret_files"), "runtime_secret_files"),
        "infisical_path_template": str(policy.get("infisical_path_template", "/relab/{env}/{name}")),
    }


def secret_env_name(secret_file_name: str) -> str:
    """Return the container env var name derived from a runtime secret file name."""
    return secret_file_name.upper()


def env_assignments(path: Path) -> dict[str, str]:
    """Parse simple KEY=VALUE assignments from an env-style file."""
    assignments: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        assignments[name.strip()] = value.strip()
    return assignments


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
        expected_file = (ROOT / "secrets" / label / name).resolve()
        if configured_file != expected_file:
            msg = f"{label}: secret '{name}' must use {expected_file}, got {configured_file}"
            raise AssertionError(msg)


def assert_rendered_secrets_are_in_inventory(config: dict[str, Any], secret_inventory: dict[str, Any]) -> None:
    """Assert rendered Compose secret names are declared in the secret inventory."""
    unexpected = sorted(set(compose_secret_names(config)) - secret_inventory["runtime_secret_files"])
    require(not unexpected, f"Compose renders secrets not declared in secret inventory: {', '.join(unexpected)}")


def assert_secret_value_is_usable(label: str, name: str, value: str) -> None:
    """Reject generated placeholder secrets in production-like environments."""
    if label in {"prod", "staging"} and value.strip().startswith(f"replace-me-{label}-"):
        msg = f"{label}: placeholder secret remains in secrets/{label}/{name}"
        raise AssertionError(msg)


def assert_existing_secret_files_do_not_use_placeholders(secret_inventory: dict[str, Any]) -> None:
    """Check existing production-like secret files for unfilled generated placeholders."""
    for label in ("staging", "prod"):
        for name in sorted(secret_inventory["runtime_secret_files"]):
            path = ROOT / "secrets" / label / name
            if path.exists():
                assert_secret_value_is_usable(label, name, path.read_text(encoding="utf-8"))


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


def require(condition: object, message: str) -> None:
    """Raise AssertionError with a human-readable message when condition is false."""
    if not condition:
        raise AssertionError(message)


def assert_deploy_env_files_are_canonical() -> None:
    """Ensure committed deploy env files contain only canonical root values."""
    forbidden_names = STALE_ENV_NAMES | SERVICE_BOUNDARY_URL_NAMES
    for path in DEPLOY_ENV_FILES:
        assignments = env_assignments(path)
        unexpected_names = sorted(set(assignments) - COMMITTED_DEPLOY_ENV_NAMES)
        require(not unexpected_names, f"{path}: unexpected env names: {', '.join(unexpected_names)}")

        forbidden_present = sorted(set(assignments) & forbidden_names)
        require(
            not forbidden_present,
            f"{path}: contains service-boundary/stale names: {', '.join(forbidden_present)}",
        )

        for name in sorted(COMMITTED_DEPLOY_ENV_NAMES):
            require(name in assignments, f"{path}: missing {name}")


def assert_root_env_example_is_operator_checklist(secret_inventory: dict[str, Any]) -> None:
    """Ensure the root env example lists required inputs and avoids app secret assignments."""
    path = ROOT / ".env.example"
    contents = path.read_text(encoding="utf-8")
    assignments = env_assignments(path)

    for name in REQUIRED_ROOT_OPERATOR_INPUT_NAMES | OPTIONAL_ROOT_OPERATOR_INPUT_NAMES:
        require(name in contents, f"{path}: missing operator input {name}")

    for name in {secret_env_name(secret_name) for secret_name in secret_inventory["runtime_secret_files"]}:
        require(name not in assignments, f"{path}: must not assign application secret {name}")

    require("secrets/<env>/" in contents, f"{path}: must point application secrets to secrets/<env>/")


def assert_removed_env_files_stay_removed() -> None:
    """Ensure removed duplicate env files do not come back."""
    for path in sorted(REMOVED_DEPLOY_ENV_FILES):
        require(not path.exists(), f"{path}: removed duplicate env config must not come back")


def assert_deploy_compose_requires_operator_values() -> None:
    """Ensure deploy Compose has fail-fast interpolation for required host values."""
    contents = (ROOT / "compose.deploy.yaml").read_text(encoding="utf-8")
    for name in REQUIRED_ROOT_OPERATOR_INPUT_NAMES:
        require(f"${{{name}:?" in contents, f"compose.deploy.yaml: {name} must use ${{VAR:?message}}")


def assert_runtime_images_do_not_hide_prod_defaults() -> None:
    """Ensure runtime images do not silently fall back to production origins."""
    for path in RUNTIME_CONFIG_FILES:
        if not path.exists():
            continue
        contents = path.read_text(encoding="utf-8")
        for pattern in HIDDEN_PROD_DEFAULT_PATTERNS:
            require(pattern not in contents, f"{path}: remove hidden production default {pattern}")


def assert_infra_boundaries_are_preserved() -> None:
    """Ensure IaC ownership boundaries stay explicit."""
    for path, reason in FORBIDDEN_INFRA_DIRECTORIES.items():
        require(not path.exists(), f"{path}: {reason}")


def assert_telemetry_examples_use_department_contract() -> None:
    """Ensure RELab documents the central telemetry endpoint contract it consumes."""
    contents = (ROOT / ".env.example").read_text(encoding="utf-8")
    require(
        "OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.cml-relab.org" in contents,
        ".env.example: OTEL example must use the current department OTLP endpoint",
    )
    require(
        "OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.cml-relab.org" not in contents,
        ".env.example: OTEL example must not use the old otlp.cml-relab.org endpoint",
    )


def docker_compose_config_missing(required_name: str) -> subprocess.CompletedProcess[str]:
    """Render deploy Compose with one required variable omitted."""
    values = {
        "EMAIL_FROM": "Reverse Engineering Lab <relab@example.test>",
        "SMTP_HOST": "smtp.example.test",
        "EMAIL_PROVIDER": "smtp",
        "EMAIL_REPLY_TO": "relab@example.test",
        "SMTP_USERNAME": "relab@example.test",
        "GITHUB_OAUTH_CLIENT_ID": "placeholder-github-client-id",
        "GOOGLE_OAUTH_CLIENT_ID": "placeholder-google-client-id",
        "BOOTSTRAP_SUPERUSER_EMAIL": "admin@example.test",
        "CLOUDFLARE_TUNNEL_TOKEN": "placeholder-tunnel-token",
    }
    values.pop(required_name)
    docker = shutil.which("docker")
    if docker is None:
        msg = "docker executable not found; install Docker to run env policy checks"
        raise FileNotFoundError(msg)

    with tempfile.NamedTemporaryFile("w", encoding="utf-8") as env_file:
        for name, value in values.items():
            env_file.write(f"{name}={value}\n")
        env_file.flush()

        env = os.environ.copy()
        for name in REQUIRED_ROOT_OPERATOR_INPUT_NAMES:
            env.pop(name, None)
        return subprocess.run(  # noqa: S603 - fixed command invokes local Docker Compose for repo policy validation.
            [
                docker,
                "compose",
                "-p",
                "relab_env_policy",
                "--env-file",
                env_file.name,
                "--env-file",
                "deploy/env/prod.compose.env",
                "-f",
                "compose.yaml",
                "-f",
                "compose.deploy.yaml",
                "config",
            ],
            cwd=ROOT,
            env=env,
            capture_output=True,
            check=False,
            text=True,
        )


def assert_deploy_compose_render_fails_for_missing_operator_values() -> None:
    """Ensure missing required host values produce clear Compose render errors."""
    for name in sorted(REQUIRED_ROOT_OPERATOR_INPUT_NAMES):
        result = docker_compose_config_missing(name)
        combined_output = f"{result.stdout}\n{result.stderr}"
        require(result.returncode != 0, f"compose render unexpectedly succeeded without {name}")
        require(name in combined_output, f"compose render without {name} did not mention the missing variable")


def run_env_policy_checks() -> None:
    """Run all environment policy checks."""
    secret_inventory = load_secret_inventory()
    assert_deploy_env_files_are_canonical()
    assert_root_env_example_is_operator_checklist(secret_inventory)
    assert_removed_env_files_stay_removed()
    assert_deploy_compose_requires_operator_values()
    assert_runtime_images_do_not_hide_prod_defaults()
    assert_infra_boundaries_are_preserved()
    assert_telemetry_examples_use_department_contract()
    assert_existing_secret_files_do_not_use_placeholders(secret_inventory)
    assert_deploy_compose_render_fails_for_missing_operator_values()


def run_secrets_check(configs: list[str]) -> None:
    """Validate rendered Compose secret paths."""
    secret_inventory = load_secret_inventory()
    for label, path in parse_labeled_paths(configs).items():
        config = load_json(path)
        assert_rendered_secrets_are_in_inventory(config, secret_inventory)
        assert_secret_files(label, config)


def format_inventory(secret_inventory: dict[str, Any]) -> str:
    """Render the runtime secret inventory for operators."""
    lines = [
        "RELab runtime secret inventory",
        "Infisical-ready contract: sync runtime_secret_files as host files before Compose starts.",
        "",
    ]
    lines.append("[Runtime secret files]")
    lines.extend(f"- {name}" for name in sorted(secret_inventory["runtime_secret_files"]))
    lines.append("")
    lines.append(f"Runtime secret manager path template: {secret_inventory['infisical_path_template']}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint."""
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("check", help="validate root environment variable policy")
    subparsers.add_parser("inventory", help="print the runtime secret inventory")

    secrets_list_parser = subparsers.add_parser("secrets-list", help="list rendered Compose secret names")
    secrets_list_parser.add_argument("config", type=Path, help="Compose config JSON file")

    secrets_check_parser = subparsers.add_parser("secrets-check", help="validate rendered Compose secret file paths")
    secrets_check_parser.add_argument("configs", nargs="+", help="Compose config JSON files as LABEL=PATH")

    args = parser.parse_args(argv)

    try:
        if args.command == "check":
            run_env_policy_checks()
            sys.stdout.write("✅ Environment variable policy checks passed\n")
        elif args.command == "inventory":
            sys.stdout.write(format_inventory(load_secret_inventory()))
        elif args.command == "secrets-list":
            for name in compose_secret_names(load_json(args.config)):
                sys.stdout.write(f"{name}\n")
        elif args.command == "secrets-check":
            run_secrets_check(args.configs)
    except (AssertionError, FileNotFoundError, TypeError) as exc:
        sys.stderr.write(f"env policy check failed: {exc}\n")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
