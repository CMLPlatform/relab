"""Unit tests for application configuration.

Tests CORS settings, host allowlists, and environment file resolution.
"""
# spell-checker: ignore PGSSL

from typing import TYPE_CHECKING

import pytest
from pydantic import HttpUrl, SecretStr
from pydantic_core import ValidationError
from sqlalchemy.engine import make_url

from app.api.auth.config import AuthSettings
from app.core.config import DEFAULT_CORS_ORIGIN_REGEX, CoreSettings, Environment
from app.core.env import get_env_file

if TYPE_CHECKING:
    from pathlib import Path

TEST_DATA_ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="


class TestCoreSettingsCors:
    """Test CORS configuration behavior in CoreSettings."""

    def test_allowed_origins_dev_normalizes_frontend_urls(self) -> None:
        """DEV environment normalizes frontend URLs to scheme+host (no trailing slash)."""
        settings = CoreSettings(
            environment=Environment.DEV,
            frontend_web_url=HttpUrl("http://localhost:3000/"),
            frontend_app_url=HttpUrl("http://localhost:8081/"),
        )
        assert settings.allowed_origins == ["http://localhost:3000", "http://localhost:8081"]

    def test_allowed_origins_staging_are_normalized(self) -> None:
        """Staging origins should match browser Origin format (no trailing slash)."""
        settings = CoreSettings(
            environment=Environment.STAGING,
            backend_api_url=HttpUrl("https://api-test.cml-relab.org/"),
            frontend_web_url=HttpUrl("https://web-test.cml-relab.org/"),
            frontend_app_url=HttpUrl("https://app-test.cml-relab.org/"),
            cors_origin_regex=None,
            postgres_password=SecretStr("test-password"),
            redis_password=SecretStr("test-password"),
            superuser_password=SecretStr("test-password"),
            superuser_email="test@example.com",
            data_encryption_keys=SecretStr(TEST_DATA_ENCRYPTION_KEY),
        )

        assert settings.allowed_origins == [
            "https://web-test.cml-relab.org",
            "https://app-test.cml-relab.org",
        ]

    def test_allowed_hosts_dev_defaults(self) -> None:
        """DEV environment should trust all hosts (Docker/Testcontainers convenience)."""
        settings = CoreSettings(environment=Environment.DEV)
        assert settings.allowed_hosts == ["*"]

    def test_allowed_hosts_derive_from_backend_api_url(self) -> None:
        """Trusted hosts should derive from backend_api_url in non-DEV environments."""
        settings = CoreSettings(
            environment=Environment.STAGING,
            backend_api_url=HttpUrl("https://api-test.cml-relab.org"),
            frontend_web_url=HttpUrl("https://web-test.cml-relab.org/"),
            frontend_app_url=HttpUrl("https://app-test.cml-relab.org/"),
            cors_origin_regex=None,
            postgres_password=SecretStr("test-password"),
            redis_password=SecretStr("test-password"),
            superuser_password=SecretStr("test-password"),
            superuser_email="test@example.com",
            data_encryption_keys=SecretStr(TEST_DATA_ENCRYPTION_KEY),
        )

        assert settings.allowed_hosts == [
            "api-test.cml-relab.org",
            "127.0.0.1",
            "localhost",
        ]

    def test_staging_rejects_cors_regex(self) -> None:
        """Staging/production should reject the permissive dev CORS regex."""
        with pytest.raises(ValidationError, match="CORS_ORIGIN_REGEX must not be set in production/staging"):
            CoreSettings(
                environment=Environment.STAGING,
                backend_api_url=HttpUrl("https://api-test.cml-relab.org"),
                cors_origin_regex=DEFAULT_CORS_ORIGIN_REGEX,
                postgres_password=SecretStr("test-password"),
                redis_password=SecretStr("test-password"),
                superuser_password=SecretStr("test-password"),
                superuser_email="test@example.com",
                data_encryption_keys=SecretStr(TEST_DATA_ENCRYPTION_KEY),
            )

    def test_production_requires_non_default_secrets(self) -> None:
        """Production config should fail fast when required secrets are missing."""
        with pytest.raises(ValidationError, match="Production security check failed"):
            CoreSettings(environment=Environment.PROD)

    def test_request_body_limit_default_is_one_mebibyte(self) -> None:
        """Non-upload request bodies should default to a conservative 1 MiB cap."""
        settings = CoreSettings(environment=Environment.DEV)
        assert settings.request_body_limit_bytes == 1024 * 1024

    def test_otel_is_disabled_by_default(self) -> None:
        """Telemetry is opt-in: no endpoint configured means OTEL is off."""
        settings = CoreSettings(environment=Environment.DEV)
        assert settings.otel_enabled is False
        assert settings.otel_exporter_otlp_endpoint is None

    def test_build_database_url_preserves_reserved_password_characters(self) -> None:
        """Database URL construction should safely encode reserved password characters."""
        settings = CoreSettings(
            environment=Environment.DEV,
            database_host="database.internal",
            database_port=5432,
            postgres_user="relab_user",
            postgres_password=SecretStr("p@ss:word/with?chars"),
        )

        url = settings.build_database_url("asyncpg", "relab_db")
        parsed = make_url(url)

        assert parsed.drivername == "postgresql+asyncpg"
        assert parsed.username == "relab_user"
        assert parsed.password == "p@ss:word/with?chars"
        assert parsed.host == "database.internal"
        assert parsed.port == 5432
        assert parsed.database == "relab_db"

    def test_sync_database_url_disables_ssl_by_default(self) -> None:
        """Sync DB URLs should explicitly disable SSL for the internal Postgres service."""
        settings = CoreSettings(
            environment=Environment.DEV,
            postgres_password=SecretStr("test-password"),
        )
        parsed = make_url(settings.sync_database_url)
        assert parsed.query["sslmode"] == "disable"

    def test_async_database_connect_args_disable_ssl_by_default(self) -> None:
        """Async DB connections should not inherit accidental PGSSL* env vars by default."""
        settings = CoreSettings(environment=Environment.DEV)
        assert settings.async_database_connect_args == {"ssl": False}

    def test_async_database_connect_args_enable_ssl_when_configured(self) -> None:
        """Async DB SSL should remain configurable for deployments that need it."""
        settings = CoreSettings(
            environment=Environment.PROD,
            database_ssl=True,
            backend_api_url=HttpUrl("https://api.cml-relab.org/"),
            frontend_web_url=HttpUrl("https://cml-relab.org/"),
            frontend_app_url=HttpUrl("https://app.cml-relab.org/"),
            postgres_password=SecretStr("test-password"),
            redis_password=SecretStr("test-password"),
            superuser_password=SecretStr("test-password"),
            superuser_email="test@example.com",
            data_encryption_keys=SecretStr(TEST_DATA_ENCRYPTION_KEY),
        )
        assert settings.async_database_connect_args == {"ssl": True}

    def test_production_requires_https_origins(self) -> None:
        """Production-like environments should use HTTPS for external URLs."""
        with pytest.raises(ValidationError, match="BACKEND_API_URL must use https"):
            CoreSettings(
                environment=Environment.PROD,
                backend_api_url=HttpUrl("http://api.cml-relab.org"),
                frontend_web_url=HttpUrl("https://cml-relab.org"),
                frontend_app_url=HttpUrl("https://app.cml-relab.org"),
                postgres_password=SecretStr("test-password"),
                redis_password=SecretStr("test-password"),
                superuser_password=SecretStr("test-password"),
                superuser_email="test@example.com",
                data_encryption_keys=SecretStr(TEST_DATA_ENCRYPTION_KEY),
            )

    def test_otel_enabled_tracks_endpoint(self) -> None:
        """Telemetry is enabled iff an exporter endpoint is configured."""
        settings = CoreSettings(environment=Environment.DEV)
        assert settings.otel_enabled is False

        settings = CoreSettings(
            environment=Environment.DEV,
            otel_exporter_otlp_endpoint="http://otel.internal:4318/v1/traces",
        )
        assert settings.otel_enabled is True


class TestModuleSettingsValidation:
    """Test non-core module settings that should fail fast on bad config."""

    def test_auth_settings_require_secrets_in_production(self) -> None:
        """Auth settings should reject blank prod/staging secrets and email config."""
        with pytest.raises(ValidationError, match="Auth settings validation failed"):
            AuthSettings(
                environment=Environment.PROD,
                fastapi_users_secret=SecretStr(""),
                google_oauth_client_id=SecretStr(""),
                google_oauth_client_secret=SecretStr(""),
                github_oauth_client_id=SecretStr(""),
                github_oauth_client_secret=SecretStr(""),
                email_host="",
                email_username="",
                email_password=SecretStr(""),
                email_from="",
                email_reply_to="",
            )


class TestGetEnvFile:
    """get_env_file() should return the correct .env path for each ENVIRONMENT value."""

    def test_dev_maps_to_development_file(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        """DEV environment should map to .env.dev."""
        monkeypatch.setenv("ENVIRONMENT", "dev")
        assert get_env_file(tmp_path) == tmp_path / ".env.dev"

    def test_staging_maps_to_staging_file(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        """STAGING environment should map to .env.staging."""
        monkeypatch.setenv("ENVIRONMENT", "staging")
        assert get_env_file(tmp_path) == tmp_path / ".env.staging"

    def test_prod_maps_to_production_file(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        """PROD environment should map to .env.prod."""
        monkeypatch.setenv("ENVIRONMENT", "prod")
        assert get_env_file(tmp_path) == tmp_path / ".env.prod"

    def test_testing_maps_to_test_file(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        """TESTING environment should map to .env.test."""
        monkeypatch.setenv("ENVIRONMENT", "testing")
        assert get_env_file(tmp_path) == tmp_path / ".env.test"

    def test_defaults_to_development_when_unset(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        """When ENVIRONMENT is unset, it should default to DEV and map to .env.dev."""
        monkeypatch.delenv("ENVIRONMENT", raising=False)
        assert get_env_file(tmp_path) == tmp_path / ".env.dev"

    def test_unknown_environment_uses_name_directly(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        """An unrecognised value falls back to .env.<value> so custom envs work."""
        monkeypatch.setenv("ENVIRONMENT", "ci")
        assert get_env_file(tmp_path) == tmp_path / ".env.ci"
