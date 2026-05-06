"""Public entrypoint for core application settings."""

from app.core.config.core import CoreSettings, settings
from app.core.config.models import (
    DEFAULT_CORS_ORIGIN_REGEX,
    DEFAULT_BOOTSTRAP_SUPERUSER_EMAIL,
    CacheNamespace,
    CacheSettings,
    Environment,
    StorageBackend,
)

__all__ = [
    "DEFAULT_CORS_ORIGIN_REGEX",
    "DEFAULT_BOOTSTRAP_SUPERUSER_EMAIL",
    "CacheNamespace",
    "CacheSettings",
    "CoreSettings",
    "Environment",
    "StorageBackend",
    "settings",
]
