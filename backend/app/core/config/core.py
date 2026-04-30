"""Configuration settings for the FastAPI app."""
# spell-checker: ignore PGSSL

from __future__ import annotations

import re
from functools import cached_property
from pathlib import Path  # noqa: TC003 # Runtime use is needed for Pydantic validation of settings
from typing import TYPE_CHECKING
from urllib.parse import urlsplit

from cryptography.fernet import Fernet
from pydantic import EmailStr, Field, HttpUrl, PostgresDsn, SecretStr, field_validator, model_validator
from sqlalchemy.engine import URL

from app.core.config.models import (
    DEFAULT_CORS_ORIGIN_REGEX,
    DEFAULT_SUPERUSER_EMAIL,
    CacheSettings,
    Environment,
    StorageBackend,
)
from app.core.env import BACKEND_DIR, RelabBaseSettings

if TYPE_CHECKING:
    from typing import Self


# Constants for database drivers to resolve PLR2004
DATABASE_DRIVER_PSYCOPG = "psycopg"
DATABASE_DRIVER_ASYNCPG = "asyncpg"
HTTPS_SCHEME = "https"
DEV_DATA_ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="


class CoreSettings(RelabBaseSettings):
    """Settings class to store all the configurations for the app."""

    # ── Environment ──────────────────────────────────────────────────────────────
    environment: Environment = Environment.DEV

    # ── Database ─────────────────────────────────────────────────────────────────
    database_host: str = "localhost"
    database_port: int = Field(default=5432, ge=1, le=65535)
    database_ssl: bool = False
    postgres_user: str = "postgres"
    postgres_password: SecretStr = SecretStr("")
    postgres_db: str = "relab_db"

    # ── Redis ─────────────────────────────────────────────────────────────────────
    redis_host: str = "localhost"
    redis_port: int = Field(default=6379, ge=1, le=65535)
    redis_db: int = Field(default=0, ge=0, le=15)
    redis_password: SecretStr = SecretStr("")

    # ── Superuser ─────────────────────────────────────────────────────────────────
    superuser_email: EmailStr = DEFAULT_SUPERUSER_EMAIL
    superuser_name: str | None = None
    superuser_password: SecretStr = SecretStr("")

    # ── Network & CORS ────────────────────────────────────────────────────────────
    backend_api_url: HttpUrl = HttpUrl("http://127.0.0.1:8001")
    frontend_web_url: HttpUrl = HttpUrl("http://127.0.0.1:8000")
    frontend_app_url: HttpUrl = HttpUrl("http://127.0.0.1:8003")
    cors_origin_regex: str | None = Field(default=None)

    @field_validator("superuser_name")
    @classmethod
    def validate_superuser_name(cls, v: str | None) -> str | None:
        """Enforce lowercase letters, digits, and underscores only."""
        if v is not None and not re.fullmatch(r"[a-z0-9_]+", v):
            msg = "superuser_name may only contain lowercase letters, digits, and underscores"
            raise ValueError(msg)
        return v

    @field_validator("cors_origin_regex")
    @classmethod
    def validate_cors_origin_regex(cls, v: str | None) -> str | None:
        """Reject patterns that would raise re.error at runtime."""
        if v is not None:
            try:
                re.compile(v)
            except re.error as e:
                msg = f"cors_origin_regex is not a valid regular expression: {e}"
                raise ValueError(msg) from e
        return v

    @field_validator("otel_exporter_otlp_endpoint", mode="before")
    @classmethod
    def normalize_empty_otel_endpoint(cls, v: str | None) -> str | None:
        """Treat empty strings as an unset OTLP endpoint."""
        if v in ("", None):
            return None
        return v

    @field_validator("data_encryption_keys")
    @classmethod
    def validate_data_encryption_keys(cls, v: SecretStr) -> SecretStr:
        """Validate configured Fernet keys when a keyring is provided."""
        raw_value = v.get_secret_value()
        if not raw_value:
            return v
        for key in (part.strip() for part in raw_value.split(",")):
            if key:
                Fernet(key.encode("ascii"))
        return v

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

    # ── Cache ─────────────────────────────────────────────────────────────────────
    cache: CacheSettings = Field(default_factory=CacheSettings)

    # ── Concurrency, request, upload, and rate limits ────────────────────────────
    db_pool_size: int = Field(default=10, ge=1, le=50)
    db_pool_max_overflow: int = Field(default=10, ge=0, le=50)
    image_resize_workers: int = Field(default=5, ge=1, le=64)
    http_max_connections: int = Field(default=100, ge=1, le=1000)
    http_max_keepalive_connections: int = Field(default=20, ge=0, le=1000)
    request_body_limit_bytes: int = Field(default=1024 * 1024, ge=1024, le=50 * 1024 * 1024)
    max_file_upload_size_mb: int = Field(default=50, ge=1, le=500)
    max_image_upload_size_mb: int = Field(default=10, ge=1, le=100)
    api_read_rate_limit: str = "300/minute"
    api_upload_rate_limit: str = "30/minute"
    # OTEL on/off is derived from the endpoint; service.name is read by the
    # OTEL SDK directly from the OTEL_SERVICE_NAME env var (set in compose).
    otel_exporter_otlp_endpoint: str | None = None

    @property
    def otel_enabled(self) -> bool:
        """Enable OpenTelemetry tracing if an OTLP endpoint is configured."""
        return self.otel_exporter_otlp_endpoint is not None

    # ── File cleanup ──────────────────────────────────────────────────────────────
    file_cleanup_enabled: bool = True
    file_cleanup_interval_hours: int = Field(default=24, ge=1)
    file_cleanup_min_file_age_minutes: int = Field(default=30, ge=0)
    file_cleanup_dry_run: bool = False

    # ── Storage ───────────────────────────────────────────────────────────────────
    storage_backend: StorageBackend = StorageBackend.FILESYSTEM
    data_encryption_keys: SecretStr = SecretStr("")
    s3_bucket: str = ""
    s3_region: str = "us-east-1"
    s3_access_key_id: SecretStr = SecretStr("")
    s3_secret_access_key: SecretStr = SecretStr("")
    s3_endpoint_url: str | None = None
    s3_base_url: str | None = None
    s3_file_prefix: str = "files"
    s3_image_prefix: str = "images"

    @cached_property
    def data_encryption_key_values(self) -> list[str]:
        """Return data-encryption keys in keyring order."""
        raw_value = self.data_encryption_keys.get_secret_value()
        keys = [key.strip() for key in raw_value.split(",") if key.strip()]
        if keys or self.environment in (Environment.STAGING, Environment.PROD):
            return keys
        return [DEV_DATA_ENCRYPTION_KEY]

    # ── Paths ─────────────────────────────────────────────────────────────────────
    uploads_path: Path = BACKEND_DIR / "data" / "uploads"
    file_storage_path: Path = uploads_path / "files"
    image_storage_path: Path = uploads_path / "images"
    static_files_path: Path = BACKEND_DIR / "app" / "static"
    templates_path: Path = BACKEND_DIR / "app" / "templates"
    log_path: Path = BACKEND_DIR / "logs"
    docs_path: Path = BACKEND_DIR / "docs" / "site"

    def build_database_url(self, driver: str, database: str) -> str:
        """Build and validate PostgreSQL database URL."""
        query: dict[str, str] = {}
        if driver == DATABASE_DRIVER_PSYCOPG:
            query = {"sslmode": "require" if self.database_ssl else "disable"}

        url = URL.create(
            f"postgresql+{driver}",
            username=self.postgres_user,
            password=self.postgres_password.get_secret_value(),
            host=self.database_host,
            port=self.database_port,
            database=database,
            query=query,
        )
        rendered = url.render_as_string(hide_password=False)
        PostgresDsn(rendered)
        return rendered

    @cached_property
    def async_database_url(self) -> str:
        """Get async database URL."""
        return self.build_database_url(DATABASE_DRIVER_ASYNCPG, self.postgres_db)

    @cached_property
    def sync_database_url(self) -> str:
        """Get sync database URL."""
        return self.build_database_url(DATABASE_DRIVER_PSYCOPG, self.postgres_db)

    @cached_property
    def async_database_connect_args(self) -> dict[str, bool]:
        """Get async engine connect args.

        Be explicit about SSL so asyncpg does not inherit PGSSL* environment
        variables from the container when talking to the internal Docker
        Postgres service.
        """
        return {"ssl": self.database_ssl}

    @cached_property
    def cache_url(self) -> str:
        """Get Redis cache URL."""
        return (
            f"redis://:{self.redis_password.get_secret_value() or ''}"
            f"@{self.redis_host}:{self.redis_port}/{self.redis_db}"
        )

    @property
    def debug(self) -> bool:
        """Enable SQL echo and DEBUG logging in development only."""
        return self.environment == Environment.DEV

    @cached_property
    def enable_caching(self) -> bool:
        """Disable Redis caching in development and testing."""
        return self.environment not in (Environment.DEV, Environment.TESTING)

    @property
    def secure_cookies(self) -> bool:
        """Require HTTPS-only cookies in production and staging."""
        return self.environment in (Environment.PROD, Environment.STAGING)

    @property
    def mock_emails(self) -> bool:
        """Skip real email delivery in development and testing."""
        return self.environment in (Environment.DEV, Environment.TESTING)

    @property
    def enable_rate_limit(self) -> bool:
        """Disable rate limiting in development and testing."""
        return self.environment not in (Environment.DEV, Environment.TESTING)

    @model_validator(mode="after")
    def validate_concurrency_settings(self) -> Self:
        """Validate cross-field concurrency constraints."""
        if self.http_max_keepalive_connections > self.http_max_connections:
            msg = (
                f"http_max_keepalive_connections ({self.http_max_keepalive_connections}) "
                f"must not exceed http_max_connections ({self.http_max_connections})"
            )
            raise ValueError(msg)
        return self

    @model_validator(mode="after")
    def validate_s3_settings(self) -> Self:
        """Require a bucket name when the S3 backend is selected."""
        if self.storage_backend == StorageBackend.S3 and not self.s3_bucket:
            msg = "S3_BUCKET must be set when STORAGE_BACKEND is 's3'"
            raise ValueError(msg)
        return self

    def _production_security_errors(self) -> list[str]:
        """Collect environment-specific security validation errors."""
        errors: list[str] = []

        if self.cors_origin_regex == DEFAULT_CORS_ORIGIN_REGEX:
            errors.append("CORS_ORIGIN_REGEX must not be set in production/staging")

        if not self.postgres_password.get_secret_value():
            errors.append("POSTGRES_PASSWORD must not be empty in production")

        if not self.redis_password.get_secret_value():
            errors.append("REDIS_PASSWORD must not be empty in production")

        if not self.superuser_password.get_secret_value():
            errors.append("SUPERUSER_PASSWORD must not be empty in production")

        if not self.data_encryption_key_values:
            errors.append("DATA_ENCRYPTION_KEYS must not be empty in production/staging")

        if self.superuser_email == DEFAULT_SUPERUSER_EMAIL:
            errors.append("SUPERUSER_EMAIL must not be the default placeholder in production")

        if self.backend_api_url.scheme != HTTPS_SCHEME:
            errors.append("BACKEND_API_URL must use https in production/staging")

        if self.frontend_app_url.scheme != HTTPS_SCHEME:
            errors.append("FRONTEND_APP_URL must use https in production/staging")

        if self.frontend_web_url.scheme != HTTPS_SCHEME:
            errors.append("FRONTEND_WEB_URL must use https in production/staging")

        return errors

    @model_validator(mode="after")
    def validate_security_settings(self) -> Self:
        """Validate environment-specific security settings."""
        if self.environment not in (Environment.PROD, Environment.STAGING):
            if self.cors_origin_regex is None:
                self.cors_origin_regex = DEFAULT_CORS_ORIGIN_REGEX
            return self

        errors = self._production_security_errors()
        if errors:
            formatted = "\n  - ".join(errors)
            msg = f"Production security check failed:\n  - {formatted}"
            raise ValueError(msg)

        return self


settings = CoreSettings()
