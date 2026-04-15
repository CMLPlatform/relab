#!/usr/bin/env python3
"""Validate RELab environment templates and runtime version policy."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def parse_env_file(path: Path) -> dict[str, str]:
    """Parse a simple env file, ignoring comments and blank lines."""
    values: dict[str, str] = {}
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if value[:1] in {"'", '"'}:
            quote = value[0]
            end = value.find(quote, 1)
            values[key.strip()] = value[1:end] if end != -1 else value[1:]
        else:
            values[key.strip()] = value.split("#", 1)[0].strip()
    return values


def require_keys(path: Path, values: dict[str, str], keys: set[str]) -> None:
    missing = sorted(key for key in keys if key not in values)
    if missing:
        raise SystemExit(f"{path}: missing required keys: {', '.join(missing)}")


def require_blank(path: Path, values: dict[str, str], keys: set[str]) -> None:
    populated = sorted(key for key in keys if values.get(key, "") not in {"", "your_token"})
    if populated:
        raise SystemExit(f"{path}: expected blank example values for secret keys: {', '.join(populated)}")


def require_non_blank(path: Path, values: dict[str, str], keys: set[str]) -> None:
    empty = sorted(key for key in keys if values.get(key, "") == "")
    if empty:
        raise SystemExit(f"{path}: required keys must not be blank: {', '.join(empty)}")


def main() -> None:
    backend_required = {
        "DATABASE_HOST",
        "DATABASE_SSL",
        "POSTGRES_USER",
        "POSTGRES_PASSWORD",
        "POSTGRES_DB",
        "FASTAPI_USERS_SECRET",
        "NEWSLETTER_SECRET",
        "GOOGLE_OAUTH_CLIENT_ID",
        "GOOGLE_OAUTH_CLIENT_SECRET",
        "GITHUB_OAUTH_CLIENT_ID",
        "GITHUB_OAUTH_CLIENT_SECRET",
        "EMAIL_HOST",
        "EMAIL_USERNAME",
        "EMAIL_PASSWORD",
        "EMAIL_FROM",
        "EMAIL_REPLY_TO",
        "REDIS_HOST",
        "REDIS_PASSWORD",
        "SUPERUSER_EMAIL",
        "SUPERUSER_PASSWORD",
        "SUPERUSER_NAME",
        "BACKEND_API_URL",
        "FRONTEND_APP_URL",
        "FRONTEND_WEB_URL",
        "OTEL_ENABLED",
        "OTEL_SERVICE_NAME",
        "OTEL_EXPORTER_OTLP_ENDPOINT",
        "RPI_CAM_PLUGIN_SECRET",
    }
    backend_secret_examples = {
        "POSTGRES_PASSWORD",
        "FASTAPI_USERS_SECRET",
        "NEWSLETTER_SECRET",
        "GOOGLE_OAUTH_CLIENT_ID",
        "GOOGLE_OAUTH_CLIENT_SECRET",
        "GITHUB_OAUTH_CLIENT_ID",
        "GITHUB_OAUTH_CLIENT_SECRET",
        "EMAIL_HOST",
        "EMAIL_USERNAME",
        "EMAIL_PASSWORD",
        "EMAIL_FROM",
        "EMAIL_REPLY_TO",
        "REDIS_PASSWORD",
        "SUPERUSER_EMAIL",
        "SUPERUSER_PASSWORD",
        "RPI_CAM_PLUGIN_SECRET",
    }
    frontend_app_required = {
        "EXPO_PUBLIC_API_URL",
        "EXPO_PUBLIC_WEBSITE_URL",
        "EXPO_PUBLIC_DOCS_URL",
        "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
    }
    frontend_web_required = {
        "PUBLIC_API_URL",
        "PUBLIC_DOCS_URL",
        "PUBLIC_APP_URL",
        "PUBLIC_LINKEDIN_URL",
        "PUBLIC_CONTACT_EMAIL",
        "ASTRO_TELEMETRY_DISABLED",
    }

    root_env = parse_env_file(ROOT / ".env.example")
    require_keys(
        ROOT / ".env.example",
        root_env,
        {
            "COMPOSE_BAKE",
            "TUNNEL_TOKEN_PROD",
            "TUNNEL_TOKEN_STAGING",
            "BACKUP_DIR",
            "BACKUP_RSYNC_REMOTE_HOST",
            "BACKUP_RSYNC_REMOTE_PATH",
            "BACKUP_RCLONE_REMOTE",
            "BACKUP_RCLONE_MULTI_THREAD_STREAMS",
            "BACKUP_RCLONE_TIMEOUT",
            "BACKUP_RCLONE_USE_COOKIES",
        },
    )

    for relative_path in (
        "backend/.env.dev.example",
        "backend/.env.staging.example",
        "backend/.env.prod.example",
        "backend/.env.test",
    ):
        path = ROOT / relative_path
        require_keys(path, parse_env_file(path), backend_required)

    for relative_path in ("backend/.env.staging.example", "backend/.env.prod.example"):
        path = ROOT / relative_path
        require_blank(path, parse_env_file(path), backend_secret_examples)

    require_non_blank(
        ROOT / "backend/.env.test",
        parse_env_file(ROOT / "backend/.env.test"),
        backend_required - {"OTEL_EXPORTER_OTLP_ENDPOINT", "REDIS_PASSWORD"},
    )

    for relative_path in (
        "frontend-app/.env.development",
        "frontend-app/.env.staging",
        "frontend-app/.env.production",
        "frontend-app/.env.test",
    ):
        path = ROOT / relative_path
        require_keys(path, parse_env_file(path), frontend_app_required)

    for relative_path in (
        "frontend-web/.env.dev",
        "frontend-web/.env.staging",
        "frontend-web/.env.prod",
        "frontend-web/.env.test",
    ):
        path = ROOT / relative_path
        require_keys(path, parse_env_file(path), frontend_web_required)

    python_version = (ROOT / ".python-version").read_text().strip()
    nvm_version = (ROOT / ".nvmrc").read_text().strip()
    if python_version != "3.14":
        raise SystemExit(f".python-version: expected 3.14, found {python_version}")
    if nvm_version != "22":
        raise SystemExit(f".nvmrc: expected 22, found {nvm_version}")

    docs_pyproject = (ROOT / "docs/pyproject.toml").read_text()
    if 'requires-python = ">= 3.14"' not in docs_pyproject:
        raise SystemExit("docs/pyproject.toml: expected requires-python to match the repo Python version policy")

    for package_path in (ROOT / "frontend-app/package.json", ROOT / "frontend-web/package.json"):
        text = package_path.read_text()
        if '"node": "22.x"' not in text or '"pnpm": "10.x"' not in text:
            raise SystemExit(f"{package_path}: expected Node/pnpm engine constraints for the repo runtime policy")

    release_config = (ROOT / ".github/release-please-config.json").read_text()
    if "backend/.python-version" in release_config:
        raise SystemExit(
            ".github/release-please-config.json: backend/.python-version should not be part of release metadata ownership"
        )

    security_workflow = (ROOT / ".github/workflows/security.yml").read_text()
    if not re.search(r"service:\s+docs-site", security_workflow):
        raise SystemExit(".github/workflows/security.yml: expected docs-site service naming in container security matrix")

    print("environment templates and runtime policies are internally consistent")


if __name__ == "__main__":
    main()
