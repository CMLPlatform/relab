"""Configuration settings for the FastAPI app."""

import re
from functools import cached_property
from ipaddress import ip_network
from pathlib import Path  # noqa: TC003
from typing import TYPE_CHECKING, Annotated
from urllib.parse import urlsplit

from pydantic import (
    AnyUrl,
    EmailStr,
    Field,
    HttpUrl,
    SecretStr,
    UrlConstraints,
    field_validator,
    model_validator,
)

from app.core.config.connection import DatabaseSettings, RedisSettings
from app.core.config.models import (
    DEFAULT_BOOTSTRAP_SUPERUSER_EMAIL,
    DEFAULT_CORS_ORIGIN_REGEX,
    CacheSettings,
    Environment,
    StorageBackend,
)
from app.core.crypto.keys import decode_data_encryption_key
from app.core.env import BACKEND_DIR, RelabBaseSettings
from app.core.secrets import validate_min_secret_bytes

if TYPE_CHECKING:
    from typing import Self


### Constants ###
HTTPS_SCHEME = "https"
OutboundHttpsUrl = Annotated[AnyUrl, UrlConstraints(allowed_schemes=[HTTPS_SCHEME], host_required=True)]
DEFAULT_OUTBOUND_HTTP_ALLOWED_URLS: tuple[OutboundHttpsUrl, ...] = (
    AnyUrl("https://github.com/login/oauth/access_token"),
    AnyUrl("https://api.github.com/user"),
    AnyUrl("https://api.github.com/user/emails"),
    AnyUrl("https://oauth2.googleapis.com/token"),
    AnyUrl("https://people.googleapis.com/v1/people/me"),
    AnyUrl("https://accounts.google.com/o/oauth2/revoke"),
    AnyUrl("https://login.microsoftonline.com/"),
    AnyUrl("https://graph.microsoft.com/v1.0/users/"),
    AnyUrl("https://api.pwnedpasswords.com/range/"),
    AnyUrl("https://raw.githubusercontent.com/disposable/disposable-email-domains/master/domains.txt"),
    AnyUrl("https://www.googleapis.com/youtube/v3/"),
)


class CoreSettings(RelabBaseSettings):
    """Settings class to store all the configurations for the app."""

    # ── Environment ──────────────────────────────────────────────────────────────
    # No default: a missing ENVIRONMENT must never silently fall back to development
    # settings (rate limiting off, insecure cookies, permissive CORS/CORP).
    environment: Environment

    # ── Database & Redis ─────────────────────────────────────────────────────────
    database: DatabaseSettings = Field(default_factory=DatabaseSettings)
    redis: RedisSettings = Field(default_factory=RedisSettings)

    # ── Superuser ─────────────────────────────────────────────────────────────────
    bootstrap_superuser_email: EmailStr = DEFAULT_BOOTSTRAP_SUPERUSER_EMAIL
    bootstrap_superuser_name: str | None = None
    bootstrap_superuser_password: SecretStr = SecretStr("")

    # ── Network & CORS ────────────────────────────────────────────────────────────
    api_public_url: HttpUrl = HttpUrl("http://127.0.0.1:8010")
    app_public_url: HttpUrl = HttpUrl("http://127.0.0.1:8011")
    docs_public_url: HttpUrl = HttpUrl("http://127.0.0.1:8012")
    site_public_url: HttpUrl = HttpUrl("http://127.0.0.1:8013")
    cors_origin_regex: str | None = Field(default=None)
    outbound_http_allowed_urls: tuple[OutboundHttpsUrl, ...] = DEFAULT_OUTBOUND_HTTP_ALLOWED_URLS

    @model_validator(mode="before")
    @classmethod
    def require_environment(cls, data: object) -> object:
        """Fail fast with a clear message when ENVIRONMENT is unset.

        Without this, pydantic's default "field required" error doesn't explain
        which values are valid, and a missing field is easy to mistake for a
        typo elsewhere in the traceback.
        """
        if isinstance(data, dict) and not data.get("environment"):
            valid = ", ".join(member.value for member in Environment)
            msg = f"ENVIRONMENT must be set explicitly (one of: {valid}). No default is applied."
            raise ValueError(msg)
        return data

    @field_validator("bootstrap_superuser_name")
    @classmethod
    def validate_bootstrap_superuser_name(cls, v: str | None) -> str | None:
        """Enforce lowercase letters, digits, and underscores only."""
        if v is not None and not re.fullmatch(r"[a-z0-9_]+", v):
            msg = "bootstrap_superuser_name may only contain lowercase letters, digits, and underscores"
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

    @field_validator("data_encryption_key")
    @classmethod
    def validate_data_encryption_key(cls, v: SecretStr) -> SecretStr:
        """Validate configured AES-256-GCM key material."""
        raw_value = v.get_secret_value()
        if not raw_value:
            msg = "DATA_ENCRYPTION_KEY must not be empty."
            raise ValueError(msg)
        try:
            decode_data_encryption_key(raw_value)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc
        return v

    @field_validator("cache_signing_secret")
    @classmethod
    def validate_cache_signing_secret(cls, v: SecretStr) -> SecretStr:
        """Validate the dedicated cache payload signing secret."""
        return validate_min_secret_bytes(v, "CACHE_SIGNING_SECRET")

    @field_validator("trusted_proxy_cidrs")
    @classmethod
    def validate_trusted_proxy_cidrs(cls, v: tuple[str, ...]) -> tuple[str, ...]:
        """Validate trusted proxy networks used for forwarded client IP headers."""
        for cidr in v:
            try:
                ip_network(cidr, strict=False)
            except ValueError as exc:
                msg = f"trusted_proxy_cidrs contains invalid CIDR: {cidr}"
                raise ValueError(msg) from exc
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
            self._normalize_origin(self.site_public_url),
            self._normalize_origin(self.app_public_url),
            self._normalize_origin(self.docs_public_url),
        ]

    @cached_property
    def allowed_hosts(self) -> list[str]:
        """Get trusted Host header values for backend requests."""
        if self.environment in (Environment.DEV, Environment.TESTING):
            return ["*"]

        backend_host = urlsplit(str(self.api_public_url)).hostname
        if backend_host:
            return [backend_host, "127.0.0.1", "localhost"]
        return ["127.0.0.1", "localhost"]

    # ── Cache ─────────────────────────────────────────────────────────────────────
    cache: CacheSettings = Field(default_factory=CacheSettings)
    cache_signing_secret: SecretStr = SecretStr("")

    # ── Worker, DB, image, and outbound HTTP capacity ────────────────────────────
    db_pool_size: int = Field(default=10, ge=1, le=50)
    db_pool_max_overflow: int = Field(default=5, ge=0, le=50)
    image_resize_workers: int = Field(default=5, ge=1, le=64)
    http_max_connections: int = Field(default=100, ge=1, le=1000)
    http_max_keepalive_connections: int = Field(default=20, ge=0, le=1000)

    # ── Request, upload, and DoS limits ──────────────────────────────────────────
    request_body_limit_bytes: int = Field(default=1024 * 1024, ge=1024, le=50 * 1024 * 1024)
    max_file_upload_size_mb: int = Field(default=50, ge=1, le=500)
    max_image_upload_size_mb: int = Field(default=10, ge=1, le=100)
    max_upload_files_per_user: int = Field(default=5000, ge=1, le=100_000)
    max_upload_bytes_per_user_mb: int = Field(default=2048, ge=1, le=1_000_000)
    malware_scan_enabled: bool = False
    clamav_host: str = ""
    clamav_port: int = Field(default=3310, ge=1, le=65535)
    clamav_scan_timeout_seconds: float = Field(default=60.0, ge=1.0, le=300.0)
    api_read_rate_limit: str = "300/minute"
    api_write_rate_limit: str = "120/minute"
    api_upload_rate_limit: str = "30/minute"
    rpi_cam_ws_auth_rate_limit: str = "10/minute"
    rpi_cam_ws_binary_frame_limit_bytes: int = Field(default=10 * 1024 * 1024, ge=1024, le=50 * 1024 * 1024)
    trusted_proxy_cidrs: tuple[str, ...] = ("127.0.0.0/8", "::1/128")
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

    # ── Storage ───────────────────────────────────────────────────────────────────
    storage_backend: StorageBackend = StorageBackend.FILESYSTEM
    data_encryption_key: SecretStr = SecretStr("")
    s3_bucket: str = ""
    s3_region: str = "us-east-1"
    s3_access_key_id: SecretStr = SecretStr("")
    s3_secret_access_key: SecretStr = SecretStr("")
    s3_endpoint_url: str | None = None
    s3_base_url: str | None = None
    s3_file_prefix: str = "files"
    s3_image_prefix: str = "images"

    @cached_property
    def data_encryption_key_bytes(self) -> bytes:
        """Return decoded AES-256-GCM key material."""
        return decode_data_encryption_key(self.data_encryption_key.get_secret_value())

    # ── Paths ─────────────────────────────────────────────────────────────────────
    uploads_path: Path = BACKEND_DIR / "data" / "uploads"
    file_storage_path: Path = uploads_path / "files"
    image_storage_path: Path = uploads_path / "images"
    static_files_path: Path = BACKEND_DIR / "app" / "static"
    log_path: Path = BACKEND_DIR / "logs"

    @property
    def debug(self) -> bool:
        """Enable SQL echo and DEBUG logging in development only."""
        return self.environment == Environment.DEV

    @cached_property
    def enable_caching(self) -> bool:
        """Disable Redis-backed endpoint caching only in tests."""
        return self.environment != Environment.TESTING

    @property
    def uploads_allow_cross_origin(self) -> bool:
        """Relax the uploads mount's resource policy outside deployed environments.

        Local dev and the E2E rig serve the API and the frontends on different
        ports of 127.0.0.1, which has no registrable domain, so Chromium blocks
        the images under `Cross-Origin-Resource-Policy: same-site`. Deployed, the
        origins share `cml-relab.org` and the strict policy costs nothing, so
        this stays derived from the environment rather than set by hand: staging
        and prod cannot opt in, whatever their env files say.
        """
        return self.environment in (Environment.DEV, Environment.TESTING)

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
        elif self.cors_origin_regex is not None and not (
            self.cors_origin_regex.startswith("^") and self.cors_origin_regex.endswith("$")
        ):
            errors.append("CORS_ORIGIN_REGEX must be anchored with ^ and $ in production/staging")

        errors.extend(self.database.role_security_errors())

        if not self.redis.password.get_secret_value():
            errors.append("REDIS_PASSWORD must not be empty in production")

        if not self.bootstrap_superuser_password.get_secret_value():
            errors.append("BOOTSTRAP_SUPERUSER_PASSWORD must not be empty in production")

        if self.bootstrap_superuser_email == DEFAULT_BOOTSTRAP_SUPERUSER_EMAIL:
            errors.append("BOOTSTRAP_SUPERUSER_EMAIL must not be the default placeholder in production")

        if self.api_public_url.scheme != HTTPS_SCHEME:
            errors.append("API_PUBLIC_URL must use https in production/staging")

        if self.app_public_url.scheme != HTTPS_SCHEME:
            errors.append("APP_PUBLIC_URL must use https in production/staging")

        if self.site_public_url.scheme != HTTPS_SCHEME:
            errors.append("SITE_PUBLIC_URL must use https in production/staging")

        if self.docs_public_url.scheme != HTTPS_SCHEME:
            errors.append("DOCS_PUBLIC_URL must use https in production/staging")

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
