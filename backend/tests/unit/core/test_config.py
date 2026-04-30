"""Unit tests for application configuration.

Tests CORS settings, host allowlists, and environment file resolution.
"""
# spell-checker: ignore PGSSL

from pathlib import Path
from typing import TYPE_CHECKING

import pytest
from pydantic import HttpUrl, SecretStr
from pydantic_core import ValidationError
from sqlalchemy.engine import make_url

from app.api.auth.config import AuthSettings
from app.core.config import DEFAULT_CORS_ORIGIN_REGEX, CoreSettings, Environment
from app.core.env import get_env_file

if TYPE_CHECKING:
    from typing import Any

TEST_DATA_ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="


def _database_role_kwargs() -> dict[str, Any]:
    """Return valid split-role database credentials for production-like settings."""
    return {
        "database_app_user": "relab_app",
        "database_app_password": SecretStr("app-password"),
        "database_migration_user": "relab_migrator",
        "database_migration_password": SecretStr("migration-password"),
        "database_backup_user": "relab_backup",
        "database_backup_password": SecretStr("backup-password"),
    }


def _production_core_settings_kwargs(**overrides: Any) -> dict[str, Any]:
    """Return valid production-like settings, with optional field overrides."""
    kwargs: dict[str, Any] = {
        "environment": Environment.PROD,
        "backend_api_url": HttpUrl("https://api.cml-relab.org"),
        "frontend_web_url": HttpUrl("https://cml-relab.org"),
        "frontend_app_url": HttpUrl("https://app.cml-relab.org"),
        "postgres_password": SecretStr("admin-password"),
        **_database_role_kwargs(),
        "redis_password": SecretStr("test-password"),
        "superuser_password": SecretStr("test-password"),
        "superuser_email": "test@example.com",
        "data_encryption_keys": SecretStr(TEST_DATA_ENCRYPTION_KEY),
    }
    kwargs.update(overrides)
    return kwargs


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
            **_production_core_settings_kwargs(
                environment=Environment.STAGING,
                backend_api_url=HttpUrl("https://api-test.cml-relab.org/"),
                frontend_web_url=HttpUrl("https://web-test.cml-relab.org/"),
                frontend_app_url=HttpUrl("https://app-test.cml-relab.org/"),
                cors_origin_regex=None,
            )
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
            **_production_core_settings_kwargs(
                environment=Environment.STAGING,
                backend_api_url=HttpUrl("https://api-test.cml-relab.org"),
                frontend_web_url=HttpUrl("https://web-test.cml-relab.org/"),
                frontend_app_url=HttpUrl("https://app-test.cml-relab.org/"),
                cors_origin_regex=None,
            )
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
                **_production_core_settings_kwargs(
                    environment=Environment.STAGING,
                    backend_api_url=HttpUrl("https://api-test.cml-relab.org"),
                    frontend_web_url=HttpUrl("https://web-test.cml-relab.org/"),
                    frontend_app_url=HttpUrl("https://app-test.cml-relab.org/"),
                    cors_origin_regex=DEFAULT_CORS_ORIGIN_REGEX,
                )
            )

    def test_production_requires_non_default_secrets(self) -> None:
        """Production config should fail fast when required secrets are missing."""
        with pytest.raises(ValidationError, match="Production security check failed"):
            CoreSettings(environment=Environment.PROD)

    def test_request_body_limit_default_is_one_mebibyte(self) -> None:
        """Non-upload request bodies should default to a conservative 1 MiB cap."""
        settings = CoreSettings(environment=Environment.DEV)
        assert settings.request_body_limit_bytes == 1024 * 1024

    def test_dos_hardening_defaults_are_conservative(self) -> None:
        """DoS controls should have safe built-in defaults for every environment."""
        settings = CoreSettings(environment=Environment.DEV)

        assert settings.max_file_upload_size_mb == 50
        assert settings.max_image_upload_size_mb == 10
        assert settings.api_read_rate_limit == "300/minute"
        assert settings.api_upload_rate_limit == "30/minute"
        assert settings.rpi_cam_ws_auth_rate_limit == "10/minute"
        assert settings.rpi_cam_ws_text_frame_limit_bytes == 65_536
        assert settings.rpi_cam_ws_binary_frame_limit_bytes == 10_485_760
        assert settings.uvicorn_limit_concurrency == 100
        assert settings.uvicorn_timeout_keep_alive == 5
        assert settings.uvicorn_h11_max_incomplete_event_size == 16_384

    def test_dos_hardening_defaults_are_not_advertised_as_env_file_knobs(self) -> None:
        """Source-owned hardening defaults should not clutter deploy env examples."""
        backend_dir = Path(__file__).resolve().parents[3]
        source_default_names = {
            "REQUEST_BODY_LIMIT_BYTES",
            "MAX_FILE_UPLOAD_SIZE_MB",
            "MAX_IMAGE_UPLOAD_SIZE_MB",
            "API_READ_RATE_LIMIT",
            "API_UPLOAD_RATE_LIMIT",
            "RPI_CAM_WS_AUTH_RATE_LIMIT",
            "RPI_CAM_WS_TEXT_FRAME_LIMIT_BYTES",
            "RPI_CAM_WS_BINARY_FRAME_LIMIT_BYTES",
            "UVICORN_TIMEOUT_KEEP_ALIVE",
            "UVICORN_H11_MAX_INCOMPLETE_EVENT_SIZE",
        }

        for env_example in (".env.prod.example", ".env.staging.example"):
            contents = (backend_dir / env_example).read_text(encoding="utf-8")
            for name in source_default_names:
                assert name not in contents

    def test_deploy_env_examples_keep_only_capacity_sized_uvicorn_knob(self) -> None:
        """Concurrency may vary by host capacity, so it remains the advertised Uvicorn knob."""
        backend_dir = Path(__file__).resolve().parents[3]

        for env_example in (".env.prod.example", ".env.staging.example"):
            contents = (backend_dir / env_example).read_text(encoding="utf-8")
            assert "UVICORN_LIMIT_CONCURRENCY" in contents

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
            database_app_user="relab_user",
            database_app_password=SecretStr("p@ss:word/with?chars"),
        )

        url = settings.build_database_url("asyncpg", "relab_db")
        parsed = make_url(url)

        assert parsed.drivername == "postgresql+asyncpg"
        assert parsed.username == "relab_user"
        assert parsed.password == "p@ss:word/with?chars"
        assert parsed.host == "database.internal"
        assert parsed.port == 5432
        assert parsed.database == "relab_db"

    def test_database_urls_use_least_privilege_roles(self) -> None:
        """Application and migration URLs should use distinct database roles."""
        settings = CoreSettings(
            environment=Environment.DEV,
            database_host="database.internal",
            database_app_user="relab_app",
            database_app_password=SecretStr("app-password"),
            database_migration_user="relab_migrator",
            database_migration_password=SecretStr("migration-password"),
        )

        async_url = make_url(settings.async_database_url)
        migration_url = make_url(settings.sync_migration_database_url)

        assert async_url.username == "relab_app"
        assert async_url.password == "app-password"
        assert migration_url.username == "relab_migrator"
        assert migration_url.password == "migration-password"

    def test_database_role_passwords_can_load_from_secret_files(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Production credentials should be loadable from Docker-style secret files."""
        (tmp_path / "database_app_password").write_text("app-secret", encoding="utf-8")
        (tmp_path / "database_migration_password").write_text("migration-secret", encoding="utf-8")
        (tmp_path / "database_backup_password").write_text("backup-secret", encoding="utf-8")
        (tmp_path / "redis_password").write_text("redis-secret", encoding="utf-8")
        settings_config: Any = {**CoreSettings.model_config, "env_file": None, "secrets_dir": tmp_path}
        monkeypatch.setattr(CoreSettings, "model_config", settings_config)

        settings = CoreSettings(
            environment=Environment.DEV,
            database_app_user="relab_app",
            database_migration_user="relab_migrator",
            database_backup_user="relab_backup",
        )

        assert settings.database_app_password.get_secret_value() == "app-secret"
        assert settings.database_migration_password.get_secret_value() == "migration-secret"
        assert settings.database_backup_password.get_secret_value() == "backup-secret"
        assert settings.redis_password.get_secret_value() == "redis-secret"

    def test_production_can_load_runtime_passwords_from_secret_files(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Production-like settings should accept runtime passwords from secrets_dir."""
        (tmp_path / "database_app_password").write_text("app-secret", encoding="utf-8")
        (tmp_path / "database_migration_password").write_text("migration-secret", encoding="utf-8")
        (tmp_path / "database_backup_password").write_text("backup-secret", encoding="utf-8")
        (tmp_path / "redis_password").write_text("redis-secret", encoding="utf-8")
        settings_config: Any = {**CoreSettings.model_config, "env_file": None, "secrets_dir": tmp_path}
        monkeypatch.setattr(CoreSettings, "model_config", settings_config)

        kwargs = _production_core_settings_kwargs()
        for name in (
            "database_app_password",
            "database_migration_password",
            "database_backup_password",
            "redis_password",
        ):
            kwargs.pop(name)
        settings = CoreSettings(**kwargs)

        assert settings.database_app_password.get_secret_value() == "app-secret"
        assert settings.database_migration_password.get_secret_value() == "migration-secret"
        assert settings.database_backup_password.get_secret_value() == "backup-secret"
        assert settings.redis_password.get_secret_value() == "redis-secret"

    def test_production_rejects_missing_redis_secret_file(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Production-like settings should fail when Redis has no password source."""
        (tmp_path / "database_app_password").write_text("app-secret", encoding="utf-8")
        (tmp_path / "database_migration_password").write_text("migration-secret", encoding="utf-8")
        (tmp_path / "database_backup_password").write_text("backup-secret", encoding="utf-8")
        settings_config: Any = {**CoreSettings.model_config, "env_file": None, "secrets_dir": tmp_path}
        monkeypatch.setattr(CoreSettings, "model_config", settings_config)

        with pytest.raises(ValidationError, match="REDIS_PASSWORD must not be empty"):
            kwargs = _production_core_settings_kwargs()
            for name in (
                "database_app_password",
                "database_migration_password",
                "database_backup_password",
                "redis_password",
            ):
                kwargs.pop(name)
            CoreSettings(**kwargs)

    def test_sync_database_url_disables_ssl_by_default(self) -> None:
        """Sync DB URLs should explicitly disable SSL for the internal Postgres service."""
        settings = CoreSettings(
            environment=Environment.DEV,
            database_migration_password=SecretStr("test-password"),
        )
        parsed = make_url(settings.sync_migration_database_url)
        assert parsed.query["sslmode"] == "disable"

    def test_async_database_connect_args_disable_ssl_by_default(self) -> None:
        """Async DB connections should not inherit accidental PGSSL* env vars by default."""
        settings = CoreSettings(environment=Environment.DEV)
        assert settings.async_database_connect_args == {"ssl": False}

    def test_async_database_connect_args_enable_ssl_when_configured(self) -> None:
        """Async DB SSL should remain configurable for deployments that need it."""
        settings = CoreSettings(**_production_core_settings_kwargs(database_ssl=True))
        assert settings.async_database_connect_args == {"ssl": True}

    def test_production_requires_https_origins(self) -> None:
        """Production-like environments should use HTTPS for external URLs."""
        with pytest.raises(ValidationError, match="BACKEND_API_URL must use https"):
            CoreSettings(**_production_core_settings_kwargs(backend_api_url=HttpUrl("http://api.cml-relab.org")))

    @pytest.mark.parametrize(
        ("field", "value", "message"),
        [
            ("database_app_user", "postgres", "DATABASE_APP_USER must not use the bootstrap/admin role"),
            ("database_migration_user", "postgres", "DATABASE_MIGRATION_USER must not use the bootstrap/admin role"),
            ("database_backup_user", "postgres", "DATABASE_BACKUP_USER must not use the bootstrap/admin role"),
            ("database_app_password", SecretStr(""), "DATABASE_APP_PASSWORD must not be empty"),
            ("database_migration_password", SecretStr(""), "DATABASE_MIGRATION_PASSWORD must not be empty"),
            ("database_backup_password", SecretStr(""), "DATABASE_BACKUP_PASSWORD must not be empty"),
        ],
    )
    def test_production_rejects_unsafe_database_role_settings(
        self, field: str, value: str | SecretStr, message: str
    ) -> None:
        """Production should fail fast when role credentials break least privilege."""
        kwargs = _production_core_settings_kwargs()
        kwargs[field] = value

        with pytest.raises(ValidationError, match=message):
            CoreSettings(**kwargs)

    def test_production_rejects_duplicate_database_runtime_roles(self) -> None:
        """Production database runtime, migration, and backup roles must be distinct."""
        with pytest.raises(ValidationError, match="Database app, migration, and backup users must be distinct"):
            CoreSettings(**_production_core_settings_kwargs(database_migration_user="relab_app"))

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
