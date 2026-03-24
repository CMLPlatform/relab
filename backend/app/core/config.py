"""Configuration settings for the FastAPI app."""

from __future__ import annotations

from enum import StrEnum
from functools import cached_property
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import urlsplit

from pydantic import BaseModel, EmailStr, Field, HttpUrl, PostgresDsn, SecretStr, model_validator

from app.core.constants import DAY, HOUR
from app.core.env import BACKEND_DIR, RelabBaseSettings

if TYPE_CHECKING:
    from typing import Self

# Default superuser credentials (must be overridden in production)
DEFAULT_SUPERUSER_EMAIL = "your-email@example.com"


class CacheNamespace(StrEnum):
    """Cache namespace identifiers for different application areas."""

    BACKGROUND_DATA = "background-data"
    DOCS = "docs"


class CacheSettings(BaseModel):
    """Centralized cache configuration for the application."""

    # FastAPI Cache settings
    prefix: str = "fastapi-cache"

    # Namespace-specific TTL settings (in seconds)
    ttls: dict[CacheNamespace, int] = Field(
        default_factory=lambda: {
            CacheNamespace.BACKGROUND_DATA: DAY,  # 24 hours
            CacheNamespace.DOCS: HOUR,  # 1 hour
        }
    )


class Environment(StrEnum):
    """Application execution environment."""

    DEV = "dev"
    STAGING = "staging"
    PROD = "prod"
    TESTING = "testing"


class CoreSettings(RelabBaseSettings):
    """Settings class to store all the configurations for the app."""

    # Application Environment
    environment: Environment = Environment.DEV

    # Database settings from .env file
    database_host: str = "localhost"
    database_port: int = 5432
    postgres_user: str = "postgres"
    postgres_password: SecretStr = SecretStr("")
    postgres_db: str = "relab_db"

    # Redis settings for caching
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    redis_password: SecretStr = SecretStr("")

    # Superuser settings
    superuser_email: EmailStr = DEFAULT_SUPERUSER_EMAIL
    superuser_password: SecretStr = SecretStr("")

    # Network settings
    backend_api_url: HttpUrl = HttpUrl("http://127.0.0.1:8001")
    frontend_web_url: HttpUrl = HttpUrl("http://127.0.0.1:8000")
    frontend_app_url: HttpUrl = HttpUrl("http://127.0.0.1:8003")
    # Regex pattern matched against the Origin header — useful in dev to allow a whole subnet without listing every IP.
    # Default covers localhost, 127.0.0.1, and any 192.168.x.x origin with any port.
    # When set, origins matching this pattern are echoed back (credentials still work, unlike allow_origins=["*"]).
    cors_origin_regex: str | None = Field(default=r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?")

    @staticmethod
    def _normalize_origin(url: HttpUrl) -> str:
        """Normalize URL-like values to browser Origin format."""
        parsed = urlsplit(str(url))
        return f"{parsed.scheme}://{parsed.netloc}"

    @cached_property
    def allowed_origins(self) -> list[str]:
        """Get CORS Origin allowlist (scheme + host + optional port)."""
        return [
            self._normalize_origin(self.frontend_web_url),
            self._normalize_origin(self.frontend_app_url),
        ]

    @cached_property
    def allowed_hosts(self) -> list[str]:
        """Get trusted Host header values for backend requests."""
        if self.environment in (Environment.DEV, Environment.TESTING):
            return ["*"]

        backend_host = urlsplit(str(self.backend_api_url)).hostname
        if backend_host:
            return [backend_host, "127.0.0.1", "localhost"]
        return ["127.0.0.1", "localhost"]

    # Cache settings
    cache: CacheSettings = Field(default_factory=CacheSettings)

    # File cleanup settings
    file_cleanup_enabled: bool = True
    file_cleanup_interval_hours: int = 24
    file_cleanup_min_file_age_minutes: int = 30
    file_cleanup_dry_run: bool = False

    # Construct directory paths
    uploads_path: Path = BACKEND_DIR / "data" / "uploads"
    file_storage_path: Path = uploads_path / "files"
    image_storage_path: Path = uploads_path / "images"
    static_files_path: Path = BACKEND_DIR / "app" / "static"
    templates_path: Path = BACKEND_DIR / "app" / "templates"
    log_path: Path = BACKEND_DIR / "logs"
    docs_path: Path = BACKEND_DIR / "docs" / "site"  # Zensical site directory

    # Construct database URLs
    def build_database_url(self, driver: str, database: str) -> str:
        """Build and validate PostgreSQL database URL."""
        url = (
            f"postgresql+{driver}://{self.postgres_user}:{self.postgres_password.get_secret_value()}"
            f"@{self.database_host}:{self.database_port}/{database}"
        )
        PostgresDsn(url)  # Validate URL format
        return url

    @cached_property
    def async_database_url(self) -> str:
        """Get async database URL."""
        return self.build_database_url("asyncpg", self.postgres_db)

    @cached_property
    def sync_database_url(self) -> str:
        """Get sync database URL."""
        return self.build_database_url("psycopg", self.postgres_db)

    @cached_property
    def cache_url(self) -> str:
        """Get Redis cache URL."""
        return (
            f"redis://:{self.redis_password.get_secret_value() or ''}"
            f"@{self.redis_host}:{self.redis_port}/{self.redis_db}"
        )

    @property
    def debug(self) -> bool:
        """Enable debug mode (SQL echo, DEBUG log level) only in development."""
        return self.environment == Environment.DEV

    @cached_property
    def enable_caching(self) -> bool:
        """Disable caching logic if we are running in development or testing."""
        return self.environment not in (Environment.DEV, Environment.TESTING)

    @property
    def secure_cookies(self) -> bool:
        """Set cookie 'Secure' flag to False in DEV so HTTP works on localhost."""
        return self.environment in (Environment.PROD, Environment.STAGING)

    @property
    def mock_emails(self) -> bool:
        """Set email sending to False in DEV and TESTING."""
        return self.environment in (Environment.DEV, Environment.TESTING)

    @property
    def enable_rate_limit(self) -> bool:
        """Disable rate limiting in DEV and TESTING."""
        return self.environment not in (Environment.DEV, Environment.TESTING)

    @model_validator(mode="after")
    def validate_security_settings(self) -> Self:
        """Validate environment-specific security settings."""
        if self.environment not in (Environment.PROD, Environment.STAGING):
            return self

        errors: list[str] = []

        if self.cors_origin_regex:
            errors.append("CORS_ORIGIN_REGEX must not be set in production/staging")

        if not self.postgres_password.get_secret_value():
            errors.append("POSTGRES_PASSWORD must not be empty in production")

        if not self.redis_password.get_secret_value():
            errors.append("REDIS_PASSWORD must not be empty in production")

        if not self.superuser_password.get_secret_value():
            errors.append("SUPERUSER_PASSWORD must not be empty in production")

        if self.superuser_email == DEFAULT_SUPERUSER_EMAIL:
            errors.append("SUPERUSER_EMAIL must not be the default placeholder in production")

        if errors:
            formatted = "\n  - ".join(errors)
            msg = f"Production security check failed:\n  - {formatted}"
            raise ValueError(msg)

        return self


# Create a settings instance that can be imported throughout the app
settings = CoreSettings()
