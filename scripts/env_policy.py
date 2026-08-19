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

# Canonical unfilled-secret marker. Must match backend/app/core/secrets.py
# SECRET_PLACEHOLDER_PREFIX and the value deploy_ops.sh writes (replace-me-<env>-<name>).
SECRET_PLACEHOLDER_PREFIX = "replace-me-"  # noqa: S105  # placeholder marker, not a credential

# Every placeholder prefix this check has ever written, current and legacy. The runtime
# (backend/app/core/secrets.py) only recognizes SECRET_PLACEHOLDER_PREFIX; this check also
# rejects prefixes from earlier scaffold generations so stale placeholders fail here instead
# of crashing the app at runtime.
KNOWN_SECRET_PLACEHOLDER_PREFIXES = (
    SECRET_PLACEHOLDER_PREFIX,  # current: deploy_ops.sh writes replace-me-<env>-<name>
    "placeholder-",  # legacy scaffold generation: placeholder-<env>-<name>
)

# Placeholder operator inputs for rendering deploy Compose during validation. Single
# source of truth: deploy_ops.sh calls `validation-env` to materialize this same set.
VALIDATION_ENV_VALUES = {
    "CLOUDFLARE_TUNNEL_TOKEN": "placeholder",
    # The Alloy telemetry overlay hard-requires both, so compose-config cannot render it
    # without them.
    "OTEL_EXPORTER_OTLP_ENDPOINT": "https://placeholder.test",
    "OTLP_AUTH_TOKEN": "placeholder-otlp-token",
    "GOOGLE_OAUTH_CLIENT_ID": "placeholder-google-client-id",
    "GITHUB_OAUTH_CLIENT_ID": "placeholder-github-client-id",
    "EMAIL_PROVIDER": "smtp",
    "SMTP_HOST": "smtp.example.test",
    "SMTP_USERNAME": "relab@example.test",
    "EMAIL_FROM": "Relab <relab@example.test>",
    "EMAIL_REPLY_TO": "relab@example.test",
    "BOOTSTRAP_SUPERUSER_EMAIL": "admin@example.test",
}

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
    # May be empty: the www landing hero falls back to its committed fixture.
    "FEATURED_PRODUCT_ID",
    # Per environment on purpose. A single value in the shared root .env resolved to
    # the staging path for prod too, which would have written prod snapshots into
    # staging's offsite repository. Committed here so the two cannot converge again.
    "RESTIC_OFFSITE_REPOSITORY",
}
REQUIRED_ROOT_OPERATOR_INPUT_NAMES = {
    "CLOUDFLARE_TUNNEL_TOKEN",
    "EMAIL_PROVIDER",
    "EMAIL_FROM",
    "EMAIL_REPLY_TO",
    "BOOTSTRAP_SUPERUSER_EMAIL",
}
OPTIONAL_ROOT_OPERATOR_INPUT_NAMES = {
    # Social login is opt-in: leave the client IDs unset to disable Google/GitHub OAuth.
    "GOOGLE_OAUTH_CLIENT_ID",
    "GITHUB_OAUTH_CLIENT_ID",
    "MICROSOFT_GRAPH_TENANT_ID",
    "MICROSOFT_GRAPH_CLIENT_ID",
    "MICROSOFT_GRAPH_SENDER_USER",
    "OTEL_EXPORTER_OTLP_ENDPOINT",
    "OTEL_EXPORTER_OTLP_PROTOCOL",
    # One token, two consumers: the API's SDK gets it folded into
    # OTEL_EXPORTER_OTLP_HEADERS by compose, and Alloy reads it directly.
    "OTLP_AUTH_TOKEN",
    # Host-specific paths and roles. NOTE: BACKUP_HOST_DIR is one value shared by
    # every stack on the host, so prod and staging co-located on one machine would
    # share a restic directory. It fails closed (the second environment's password
    # will not open the first's repo), but see deploy/DEPLOY-PROD.md Part 1.1 before doing that.
    "BACKUP_HOST_DIR",
    "POSTGRES_SUPERUSER",
    # Upload ceilings and malware scanning, overridable per instance.
    "MAX_UPLOAD_FILES_PER_USER",
    "MAX_UPLOAD_BYTES_PER_USER_MB",
    "MALWARE_SCAN_ENABLED",
}
STALE_ENV_NAMES = {
    "API_ORIGIN",
    "APP_ENV",
    "APP_ORIGIN",
    # Retired with the in-container scheduler; backups are a systemd timer now.
    "BACKUP_INTERVAL_SECONDS",
    "BACKUP_ON_START",
    "BACKUP_PING_URL",
    "BACKUP_RUN_ONCE",
    "BACKUP_STATE_DIR",
    "BUILD_MODE",
    "COMPOSE_PROJECT_NAME",
    "CSP_API_ORIGIN",
    "DOCS_ORIGIN",
    "OAUTH_ALLOWED_REDIRECT_URIS",
    "MICROSOFT_GRAPH_SAVE_TO_SENT_ITEMS",
    "BOOTSTRAP_SUPERUSER_NAME",
    "BACKEND_API_URL",
    "DOCS_URL",
    "FRONTEND_APP_URL",
    "RESTIC_KEEP_HOURLY",
    "RESTIC_KEEP_DAILY",
    "RESTIC_KEEP_WEEKLY",
    "RESTIC_KEEP_MONTHLY",
    "WEB_PUBLIC_URL",
    "WEB_ORIGIN",
    "WEB_CONCURRENCY",
}
SERVICE_BOUNDARY_URL_NAMES = {
    "CADDY_API_ORIGIN",
    "EXPO_PUBLIC_API_URL",
    "EXPO_PUBLIC_DOCS_URL",
    "EXPO_PUBLIC_WEBSITE_URL",
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
    # www/.env.dev is intentionally kept: it holds only localhost dev origins for
    # `astro dev`, not deploy configuration, so it is not the duplication this
    # policy exists to prevent.
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
    """Load Relab's compact provider-neutral secret inventory."""
    with path.open("rb") as f:
        raw = tomllib.load(f)

    policy = raw.get("env_policy")
    if not isinstance(policy, dict):
        msg = f"{path}: missing [env_policy] table"
        raise TypeError(msg)

    required = _as_string_set(policy.get("required_secret_files"), "required_secret_files")
    optional = _as_string_set(policy.get("optional_secret_files", []), "optional_secret_files")
    both = required & optional
    if both:
        msg = f"{path}: secrets in both required and optional: {', '.join(sorted(both))}"
        raise TypeError(msg)

    return {
        "runtime_secret_files": required | optional,
        "optional_secret_files": optional,
        "infisical_path_template": str(policy.get("infisical_path_template", "/relab/{env}/{name}")),
    }


def write_validation_env_file(path: Path) -> None:
    """Write placeholder operator inputs used to render deploy Compose during validation."""
    path.write_text("".join(f"{name}={value}\n" for name, value in VALIDATION_ENV_VALUES.items()), encoding="utf-8")


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
        configured_file = Path(str(secret_config.get("file", ""))).resolve()
        expected_file = (ROOT / "secrets" / label / name).resolve()
        if configured_file != expected_file:
            msg = f"{label}: secret '{name}' must use {expected_file}, got {configured_file}"
            raise AssertionError(msg)


def assert_rendered_secrets_are_in_inventory(config: dict[str, Any], secret_inventory: dict[str, Any]) -> None:
    """Assert rendered Compose secret names are declared in the secret inventory."""
    unexpected = sorted(set(compose_secret_names(config)) - secret_inventory["runtime_secret_files"])
    require(not unexpected, f"Compose renders secrets not declared in secret inventory: {', '.join(unexpected)}")


def assert_secret_value_is_usable(label: str, name: str, value: str, *, is_optional: bool) -> None:
    """Reject generated placeholder secrets in production-like environments.

    Matches the runtime placeholder marker (``backend/app/core/secrets.py``
    ``SECRET_PLACEHOLDER_PREFIX``), not the per-env ``replace-me-{label}-`` form,
    so a placeholder carried over from another env (e.g. ``secrets/staging/*``
    copied into ``secrets/prod/``) is still caught here rather than only at runtime.
    Also rejects legacy placeholder prefixes (see ``KNOWN_SECRET_PLACEHOLDER_PREFIXES``)
    that the runtime itself does not recognize, since those have shipped to hosts too.

    Optional secrets (an unused external-identity provider, say) legitimately stay an
    unfilled placeholder when the operator does not use that provider: warn instead of
    failing, since the template generator has no way to invent real provider credentials.
    """
    stripped = value.strip()
    if label in {"prod", "staging"} and stripped.startswith(KNOWN_SECRET_PLACEHOLDER_PREFIXES):
        if is_optional:
            sys.stdout.write(f"{label}: optional secret {name} is an unfilled placeholder (provider not configured?)\n")
            return
        msg = f"{label}: placeholder secret remains in secrets/{label}/{name}"
        raise AssertionError(msg)


def assert_offsite_remote_is_configured() -> None:
    """Warn when a committed offsite repository names an rclone remote no secret defines.

    ``RESTIC_OFFSITE_REPOSITORY`` is committed per environment, but the credential that
    reaches it is a hand-written ``secrets/<env>/rclone.conf``. Those are two separate
    facts, and only the first is version-controlled — so a host can be fully configured
    on paper and still have no offsite copy.

    The nightly backup deliberately SKIPS the offsite step (loudly, exit 0) in that
    state rather than failing, because a run that fails every night leaves the alert
    permanently red, which is indistinguishable from having no alert. That makes this
    the place the gap has to surface instead: before the deploy, not at 02:30 nightly.
    Warn rather than fail — local-only backups are a legitimate configuration.
    """
    for label in ("staging", "prod"):
        env_file = ROOT / "deploy" / "env" / f"{label}.compose.env"
        if not env_file.exists():
            continue
        repo = ""
        for line in env_file.read_text().splitlines():
            if line.startswith("RESTIC_OFFSITE_REPOSITORY="):
                repo = line.partition("=")[2].strip()
        if not repo.startswith("rclone:"):
            continue
        remote = repo.removeprefix("rclone:").partition(":")[0]
        config = ROOT / "secrets" / label / "rclone.conf"
        if not config.exists():
            continue
        if f"[{remote}]" not in config.read_text():
            sys.stdout.write(
                f"{label}: offsite repository names rclone remote '{remote}' but "
                f"secrets/{label}/rclone.conf does not define it — backups will be LOCAL ONLY\n"
            )


def assert_existing_secret_files_do_not_use_placeholders(secret_inventory: dict[str, Any]) -> None:
    """Check existing production-like secret files for unfilled or empty required secrets.

    Runs against the deploy host's populated ``secrets/<env>/`` tree (in CI these files
    do not exist, so every check is skipped). A required secret that exists but is empty
    would mount as a blank file and fail the app confusingly at runtime; catch it here.
    Optional secrets (the unused email provider) may be empty by design.
    """
    optional = secret_inventory["optional_secret_files"]
    for label in ("staging", "prod"):
        for name in sorted(secret_inventory["runtime_secret_files"]):
            path = ROOT / "secrets" / label / name
            if not path.exists():
                continue
            value = path.read_text(encoding="utf-8")
            assert_secret_value_is_usable(label, name, value, is_optional=name in optional)
            if name not in optional and not value.strip():
                msg = f"{label}: required secret secrets/{label}/{name} is empty"
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
    """Ensure Relab documents the central telemetry endpoint contract it consumes."""
    contents = (ROOT / ".env.example").read_text(encoding="utf-8")
    # The hostname is owned by CMLPlatform/monitoring, whose infra/main.tf declares a
    # `cloudflare_dns_record.otlp` for `otlp.<domain>` and routes it to the collector's
    # HTTP receiver. There is no `otel.` record and no `logs.` record, so those are the
    # wrong names, not alternatives.
    require(
        "OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.cml-relab.org" in contents,
        ".env.example: OTEL example must use otlp.cml-relab.org, the hostname the monitoring stack actually publishes",
    )
    require(
        "OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.cml-relab.org" not in contents,
        ".env.example: otel.cml-relab.org does not exist; the record is otlp.",
    )
    # The collector authenticates machines with a bearer token (Cloudflare Access
    # fronts Grafana, not OTLP), so a Basic credential here is stale and 401s.
    require(
        "OTLP_AUTH_TOKEN=" in contents,
        ".env.example: the OTLP collector authenticates with a bearer token; document OTLP_AUTH_TOKEN",
    )


def assert_e2e_postgres_runs_initdb_scripts(config: dict[str, Any]) -> None:
    """Ensure E2E Postgres creates the least-privilege application roles."""
    postgres_service = (config.get("services") or {}).get("postgres") or {}
    volumes = postgres_service.get("volumes") or []
    expected_source = str((ROOT / "deploy" / "postgres" / "initdb").resolve())

    for volume in volumes:
        if not isinstance(volume, dict):
            continue
        if volume.get("target") == "/docker-entrypoint-initdb.d" and Path(
            str(volume.get("source", ""))
        ).resolve() == Path(expected_source):
            return

    msg = "compose.e2e.yaml: postgres must mount deploy/postgres/initdb at /docker-entrypoint-initdb.d"
    raise AssertionError(msg)


def docker_compose_config_missing(required_name: str) -> subprocess.CompletedProcess[str]:
    """Render deploy Compose with one required variable omitted."""
    values = dict(VALIDATION_ENV_VALUES)
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
    assert_offsite_remote_is_configured()
    assert_deploy_compose_render_fails_for_missing_operator_values()


def run_secrets_check(configs: list[str]) -> None:
    """Validate rendered Compose secret paths."""
    secret_inventory = load_secret_inventory()
    for label, path in parse_labeled_paths(configs).items():
        config = load_json(path)
        assert_rendered_secrets_are_in_inventory(config, secret_inventory)
        assert_secret_files(label, config)


def run_e2e_compose_check(config_path: Path) -> None:
    """Validate rendered E2E Compose invariants."""
    assert_e2e_postgres_runs_initdb_scripts(load_json(config_path))


def format_inventory(secret_inventory: dict[str, Any]) -> str:
    """Render the runtime secret inventory for operators."""
    lines = [
        "Relab runtime secret inventory",
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

    validation_env_parser = subparsers.add_parser(
        "validation-env", help="write placeholder operator inputs for Compose validation"
    )
    validation_env_parser.add_argument("path", type=Path, help="destination env file path")

    secrets_list_parser = subparsers.add_parser("secrets-list", help="list rendered Compose secret names")
    secrets_list_parser.add_argument("config", type=Path, help="Compose config JSON file")

    secrets_check_parser = subparsers.add_parser("secrets-check", help="validate rendered Compose secret file paths")
    secrets_check_parser.add_argument("configs", nargs="+", help="Compose config JSON files as LABEL=PATH")

    subparsers.add_parser(
        "secrets-placeholder-check", help="check existing secret files for placeholder or empty values"
    )

    e2e_compose_check_parser = subparsers.add_parser("e2e-compose-check", help="validate rendered E2E Compose")
    e2e_compose_check_parser.add_argument("config", type=Path, help="rendered E2E Compose config JSON")

    args = parser.parse_args(argv)

    try:
        if args.command == "check":
            run_env_policy_checks()
            sys.stdout.write("✅ Environment variable policy checks passed\n")
        elif args.command == "inventory":
            # Both suppressed writes below emit secret file NAMES from committed config, never values.
            sys.stdout.write(format_inventory(load_secret_inventory()))  # codeql[py/clear-text-logging-sensitive-data]
        elif args.command == "validation-env":
            write_validation_env_file(args.path)
        elif args.command == "secrets-list":
            for name in compose_secret_names(load_json(args.config)):
                sys.stdout.write(f"{name}\n")  # codeql[py/clear-text-logging-sensitive-data]
        elif args.command == "secrets-check":
            run_secrets_check(args.configs)
        elif args.command == "secrets-placeholder-check":
            assert_existing_secret_files_do_not_use_placeholders(load_secret_inventory())
        elif args.command == "e2e-compose-check":
            run_e2e_compose_check(args.config)
    except (AssertionError, FileNotFoundError, TypeError) as exc:
        sys.stderr.write(f"env policy check failed: {exc}\n")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
