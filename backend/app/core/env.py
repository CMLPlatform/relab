"""Shared helpers for environment-based settings loading."""

import os
from pathlib import Path
from typing import TYPE_CHECKING

from pydantic_settings import BaseSettings, PydanticBaseSettingsSource, SettingsConfigDict

if TYPE_CHECKING:
    from pathlib import Path as PathType

# Maps local/test ENVIRONMENT values to backend dotenv fixtures. Production-like
# deployments use process env and mounted secrets only.
_ENV_FILE_MAP: dict[str, str | None] = {
    "dev": ".env.dev",
    "staging": None,
    "prod": None,
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


def get_env_file(base_dir: PathType) -> Path | None:
    """Return the .env file path for the current ENVIRONMENT.

    Falls back to ``dev`` (i.e. ``.env.dev``) when the variable is absent.
    Production-like and custom environments do not load backend dotenv files;
    pydantic-settings then reads process env and configured secrets only.
    """
    env = get_environment_name()
    filename = _ENV_FILE_MAP.get(env)
    if filename is None:
        return None
    return base_dir / filename


def get_secrets_dir(
    repo_dir: PathType = BACKEND_DIR.parent,
    *,
    docker_secrets_dir: PathType = Path("/run/secrets"),
) -> Path | None:
    """Return the active secrets directory for the current environment."""
    docker_dir = Path(docker_secrets_dir)
    if docker_dir.exists():
        return docker_dir

    local_secrets_dir = Path(repo_dir) / "secrets" / get_environment_name()
    return local_secrets_dir if local_secrets_dir.exists() else None


class RelabBaseSettings(BaseSettings):
    """Shared settings base class for backend modules."""

    model_config = SettingsConfigDict(env_file=get_env_file(BACKEND_DIR), extra="ignore", secrets_dir=get_secrets_dir())

    @classmethod
    def settings_customise_sources(
        cls,
        _settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        """Prefer runtime secret files over exported env and backend dotenv values."""
        return init_settings, file_secret_settings, env_settings, dotenv_settings
