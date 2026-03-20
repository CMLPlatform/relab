"""Environment-based .env file selection for pydantic-settings."""

import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pathlib import Path

# Maps the ENVIRONMENT variable (matching app.core.config.Environment) to a .env filename.
# Mirrors the naming convention used by the frontend apps.
_ENV_FILE_MAP: dict[str, str] = {
    "dev": ".env.dev",
    "staging": ".env.staging",
    "prod": ".env.prod",
    "testing": ".env.test",
}


def get_env_file(base_dir: Path) -> Path:
    """Return the .env file path for the current ENVIRONMENT.

    Falls back to ``dev`` (i.e. ``.env.dev``) when the variable is
    absent.  pydantic-settings silently ignores a missing file, so there is no
    error if the file does not exist yet.
    """
    env = os.environ.get("ENVIRONMENT", "dev")
    filename = _ENV_FILE_MAP.get(env, f".env.{env}")
    return base_dir / filename
