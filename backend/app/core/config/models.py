"""Reusable value objects and enums for core application settings."""

from enum import StrEnum

from pydantic import BaseModel, Field

from app.core.constants import DAY, HOUR

DEFAULT_BOOTSTRAP_SUPERUSER_EMAIL = "your-email@example.com"
DEFAULT_CORS_ORIGIN_REGEX = r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?"


class CacheNamespace(StrEnum):
    """Cache namespace identifiers for different application areas."""

    REFERENCE_DATA = "reference-data"
    DOCS = "docs"


class CacheSettings(BaseModel):
    """Centralized cache configuration for the application."""

    prefix: str = "fastapi-cache"
    ttls: dict[CacheNamespace, int] = Field(
        default_factory=lambda: {
            CacheNamespace.REFERENCE_DATA: DAY,
            CacheNamespace.DOCS: HOUR,
        }
    )


class StorageBackend(StrEnum):
    """Available file storage backends."""

    FILESYSTEM = "filesystem"
    S3 = "s3"


class Environment(StrEnum):
    """Application execution environment."""

    DEV = "dev"
    STAGING = "staging"
    PROD = "prod"
    TESTING = "testing"
