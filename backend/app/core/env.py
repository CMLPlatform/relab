"""Shared helpers for environment-based settings loading."""

import os
from pathlib import Path
from typing import TYPE_CHECKING

from pydantic_settings import BaseSettings, SettingsConfigDict

if TYPE_CHECKING:
    from pathlib import Path as PathType

# Maps the ENVIRONMENT variable (matching app.core.config.Environment) to a .env filename.
# Mirrors the naming convention used by the frontend apps.
_ENV_FILE_MAP: dict[str, str] = {
    "dev": ".env.dev",
    "staging": ".env.staging",
    "prod": ".env.prod",
    "testing": ".env.test",
}


# Backend repo root. This file lives at ``backend/app/core/env.py``.
BACKEND_DIR = Path(__file__).parents[2].resolve()


def get_environment_name() -> str:
    """Return the active backend environment name."""
    return os.environ.get("ENVIRONMENT", "dev")


def is_production_like_environment(environment: str | None = None) -> bool:
    """Return True for staging/production-style runtime validation."""
    return (environment or get_environment_name()) in {"staging", "prod"}


def get_env_file(base_dir: PathType) -> Path:
    """Return the .env file path for the current ENVIRONMENT.

    Falls back to ``dev`` (i.e. ``.env.dev``) when the variable is
    absent.  pydantic-settings silently ignores a missing file, so there is no
    error if the file does not exist yet.
    """
    env = get_environment_name()
    filename = _ENV_FILE_MAP.get(env, f".env.{env}")
    return base_dir / filename


class RelabBaseSettings(BaseSettings):
    """Shared settings base class for backend modules."""

    model_config = SettingsConfigDict(env_file=get_env_file(BACKEND_DIR), extra="ignore")
