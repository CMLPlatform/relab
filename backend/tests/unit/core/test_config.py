"""Unit tests for application configuration.

Tests CORS settings, host allowlists, transport settings, and environment file resolution.
"""

import ssl
from typing import TYPE_CHECKING

import pytest
from pydantic import HttpUrl, RedisDsn, SecretStr
from pydantic_core import ValidationError
from sqlalchemy.engine import make_url

from app.core.config import DEFAULT_CORS_ORIGIN_REGEX, CoreSettings, DatabaseSettings, Environment, RedisSettings
from app.core.env import get_env_file, get_secrets_dir

if TYPE_CHECKING:
    from pathlib import Path
    from typing import Any

TEST_DATA_ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
TEST_CACHE_SIGNING_SECRET = "cache-signing-secret-with-32-bytes"


def _database_role_kwargs() -> dict[str, DatabaseSettings]:
    """Return a DatabaseSettings with valid split-role credentials for production-like settings."""
    return {
        "database": DatabaseSettings(
            app_user="relab_app",
            app_password=SecretStr("app-password"),
            migration_user="relab_migrator",
            migration_password=SecretStr("migration-password"),
            backup_user="relab_backup",
            backup_password=SecretStr("backup-password"),
        )
    }


def _production_core_settings_kwargs(**overrides: object) -> dict[str, Any]:
    """Return valid production-like settings, with optional field overrides."""
    kwargs: dict[str, Any] = {
        "environment": Environment.PROD,
        "api_public_url": HttpUrl("https://api.cml-relab.org"),
        "site_public_url": HttpUrl("https://cml-relab.org"),
        "app_public_url": HttpUrl("https://app.cml-relab.org"),
        "docs_public_url": HttpUrl("https://docs.cml-relab.org"),
        **_database_role_kwargs(),
        "redis": RedisSettings(password=SecretStr("test-password")),
        "bootstrap_superuser_password": SecretStr("test-password"),
        "bootstrap_superuser_email": "test@example.com",
        "data_encryption_key": SecretStr(TEST_DATA_ENCRYPTION_KEY),
        "cache_signing_secret": SecretStr(TEST_CACHE_SIGNING_SECRET),
    }
    # postgres_password is part of DatabaseSettings now; if caller overrides "database", use that
    kwargs.update(overrides)
    return kwargs


def test_allowed_origins_include_frontend_origins() -> None:
    """CORS should allow the browser clients that call the backend."""
    settings = CoreSettings(
        environment=Environment.DEV,
        api_public_url=HttpUrl("http://127.0.0.1:9010/"),
        app_public_url=HttpUrl("http://127.0.0.1:9011/"),
        docs_public_url=HttpUrl("http://127.0.0.1:9012/"),
        site_public_url=HttpUrl("http://127.0.0.1:9013/"),
    )

    assert settings.allowed_origins == [
        "http://127.0.0.1:9013",
        "http://127.0.0.1:9011",
        "http://127.0.0.1:9012",
    ]


def test_allowed_origins_staging_are_normalized() -> None:
    """Staging origins should include browser app origins."""
    settings = CoreSettings(
        **_production_core_settings_kwargs(
            environment=Environment.STAGING,
            api_public_url=HttpUrl("https://api-test.cml-relab.org/"),
            site_public_url=HttpUrl("https://web-test.cml-relab.org/"),
            app_public_url=HttpUrl("https://app-test.cml-relab.org/"),
            docs_public_url=HttpUrl("https://docs-test.cml-relab.org/"),
            cors_origin_regex=None,
        )
    )

    assert settings.allowed_origins == [
        "https://web-test.cml-relab.org",
        "https://app-test.cml-relab.org",
        "https://docs-test.cml-relab.org",
    ]


def test_allowed_hosts_dev_defaults() -> None:
    """DEV environment should trust all hosts (Docker/Testcontainers convenience)."""
    settings = CoreSettings(environment=Environment.DEV)
    assert settings.allowed_hosts == ["*"]


def test_allowed_hosts_derive_from_api_public_url() -> None:
    """Trusted hosts should derive from api_public_url in non-DEV environments."""
    settings = CoreSettings(
        **_production_core_settings_kwargs(
            environment=Environment.STAGING,
            api_public_url=HttpUrl("https://api-test.cml-relab.org"),
            site_public_url=HttpUrl("https://web-test.cml-relab.org/"),
            app_public_url=HttpUrl("https://app-test.cml-relab.org/"),
            cors_origin_regex=None,
        )
    )

    assert settings.allowed_hosts == [
        "api-test.cml-relab.org",
        "127.0.0.1",
        "localhost",
    ]


def test_staging_rejects_cors_regex() -> None:
    """Staging/production should reject the permissive dev CORS regex."""
    with pytest.raises(ValidationError, match="CORS_ORIGIN_REGEX must not be set in production/staging"):
        CoreSettings(
            **_production_core_settings_kwargs(
                environment=Environment.STAGING,
                api_public_url=HttpUrl("https://api-test.cml-relab.org"),
                site_public_url=HttpUrl("https://web-test.cml-relab.org/"),
                app_public_url=HttpUrl("https://app-test.cml-relab.org/"),
                cors_origin_regex=DEFAULT_CORS_ORIGIN_REGEX,
            )
        )


def test_production_requires_non_default_secrets() -> None:
    """Production config should fail fast when required secrets are missing."""
    with pytest.raises(ValidationError, match="Production security check failed"):
        CoreSettings(environment=Environment.PROD)


def test_cache_signing_secret_rejects_short_values() -> None:
    """Cache payload signing should use dedicated key material with a 32-byte floor."""
    with pytest.raises(ValidationError, match="CACHE_SIGNING_SECRET must be at least 32 bytes"):
        CoreSettings(environment=Environment.DEV, cache_signing_secret=SecretStr("short"))


def test_dos_hardening_defaults_are_conservative() -> None:
    """DoS controls should have safe built-in defaults for every environment."""
    settings = CoreSettings(environment=Environment.DEV)

    assert settings.request_body_limit_bytes == 1024 * 1024
    assert settings.max_file_upload_size_mb == 50
    assert settings.max_image_upload_size_mb == 10
    assert settings.api_read_rate_limit == "300/minute"
    assert settings.api_write_rate_limit == "120/minute"
    assert settings.api_upload_rate_limit == "30/minute"
    assert settings.rpi_cam_ws_auth_rate_limit == "10/minute"
    assert settings.rpi_cam_ws_binary_frame_limit_bytes == 10_485_760
    assert settings.uvicorn_limit_concurrency == 100
    assert settings.uvicorn_timeout_keep_alive == 5
    assert settings.uvicorn_h11_max_incomplete_event_size == 16_384
    assert settings.trusted_proxy_cidrs == ("127.0.0.0/8", "::1/128")


def test_outbound_http_allowlist_defaults_to_known_backend_destinations() -> None:
    """Backend outbound HTTP should default to narrow integration URL prefixes."""
    settings = CoreSettings(environment=Environment.DEV)

    assert tuple(str(url) for url in settings.outbound_http_allowed_urls) == (
        "https://github.com/login/oauth/access_token",
        "https://api.github.com/user",
        "https://api.github.com/user/emails",
        "https://oauth2.googleapis.com/token",
        "https://people.googleapis.com/v1/people/me",
        "https://accounts.google.com/o/oauth2/revoke",
        "https://login.microsoftonline.com/",
        "https://graph.microsoft.com/v1.0/users/",
        "https://api.pwnedpasswords.com/range/",
        "https://raw.githubusercontent.com/disposable/disposable-email-domains/master/domains.txt",
        "https://www.googleapis.com/youtube/v3/",
    )


def test_outbound_http_allowlist_uses_pydantic_url_normalization() -> None:
    """Outbound allowlist values should be validated and normalized URLs."""
    settings = CoreSettings(
        environment=Environment.DEV,
        outbound_http_allowed_urls=("https://API.PWNEDPASSWORDS.COM/range/", "https://graph.microsoft.com"),
    )

    assert tuple(str(url) for url in settings.outbound_http_allowed_urls) == (
        "https://api.pwnedpasswords.com/range/",
        "https://graph.microsoft.com/",
    )


@pytest.mark.parametrize("url", ["", "api.example.com", "http://api.example.com", "ftp://api.example.com"])
def test_outbound_http_allowlist_rejects_invalid_urls(url: str) -> None:
    """Outbound allowlist entries should be HTTP(S) URLs parsed by Pydantic."""
    with pytest.raises(ValidationError, match="outbound_http_allowed_urls"):
        CoreSettings(environment=Environment.DEV, outbound_http_allowed_urls=(url,))


def test_trusted_proxy_cidrs_reject_invalid_networks() -> None:
    """Proxy trust configuration should fail fast for invalid CIDR values."""
    with pytest.raises(ValidationError, match="trusted_proxy_cidrs contains invalid CIDR"):
        CoreSettings(environment=Environment.DEV, trusted_proxy_cidrs=("not-a-cidr",))


def test_otel_is_disabled_by_default() -> None:
    """Telemetry is opt-in: no endpoint configured means OTEL is off."""
    settings = CoreSettings(environment=Environment.DEV)
    assert settings.otel_enabled is False
    assert settings.otel_exporter_otlp_endpoint is None


def test_build_database_url_preserves_reserved_password_characters() -> None:
    """Database URL construction should safely encode reserved password characters."""
    settings = CoreSettings(
        environment=Environment.DEV,
        database=DatabaseSettings(
            host="database.internal",
            port=5432,
            app_user="relab_user",
            app_password=SecretStr("p@ss:word/with?chars"),
        ),
    )

    url = settings.database.build_database_url("asyncpg", "relab_db")
    parsed = make_url(url)

    assert parsed.drivername == "postgresql+asyncpg"
    assert parsed.username == "relab_user"
    assert parsed.password == "p@ss:word/with?chars"
    assert parsed.host == "database.internal"
    assert parsed.port == 5432
    assert parsed.database == "relab_db"


def test_cache_url_preserves_reserved_password_characters() -> None:
    """Redis URL construction should safely encode reserved password characters."""
    settings = CoreSettings(
        environment=Environment.DEV,
        redis=RedisSettings(
            host="redis.internal",
            port=6379,
            db=2,
            password=SecretStr("p@ss:word/with?chars"),
        ),
    )

    url = settings.redis.cache_url

    RedisDsn(url)
    assert url == "redis://:p%40ss%3Aword%2Fwith%3Fchars@redis.internal:6379/2"


def test_endpoint_caching_is_enabled_outside_testing() -> None:
    """Redis-backed endpoint caching should be available in dev and production-like environments."""
    assert CoreSettings(environment=Environment.DEV).enable_caching is True
    assert CoreSettings(environment=Environment.TESTING).enable_caching is False


def test_database_urls_use_least_privilege_roles() -> None:
    """Application and migration URLs should use distinct database roles."""
    settings = CoreSettings(
        environment=Environment.DEV,
        database=DatabaseSettings(
            host="database.internal",
            app_user="relab_app",
            app_password=SecretStr("app-password"),
            migration_user="relab_migrator",
            migration_password=SecretStr("migration-password"),
        ),
    )

    async_url = make_url(settings.database.async_url)
    migration_url = make_url(settings.database.sync_migration_url)

    assert async_url.username == "relab_app"
    assert async_url.password == "app-password"
    assert migration_url.username == "relab_migrator"
    assert migration_url.password == "migration-password"


def test_database_role_passwords_can_load_from_secret_files(tmp_path: Path) -> None:
    """Production credentials should be loadable from Docker-style secret files."""
    (tmp_path / "database_app_password").write_text("app-secret", encoding="utf-8")
    (tmp_path / "database_migration_password").write_text("migration-secret", encoding="utf-8")
    (tmp_path / "database_backup_password").write_text("backup-secret", encoding="utf-8")
    (tmp_path / "redis_password").write_text("redis-secret", encoding="utf-8")

    db = DatabaseSettings(
        _env_file=None,
        _secrets_dir=tmp_path,
        app_user="relab_app",
        migration_user="relab_migrator",
        backup_user="relab_backup",
    )
    redis = RedisSettings(_env_file=None, _secrets_dir=tmp_path)
    settings = CoreSettings(
        environment=Environment.DEV,
        database=db,
        redis=redis,
        data_encryption_key=SecretStr(TEST_DATA_ENCRYPTION_KEY),
        cache_signing_secret=SecretStr(TEST_CACHE_SIGNING_SECRET),
    )

    assert settings.database.app_password.get_secret_value() == "app-secret"
    assert settings.database.migration_password.get_secret_value() == "migration-secret"
    assert settings.database.backup_password.get_secret_value() == "backup-secret"
    assert settings.redis.password.get_secret_value() == "redis-secret"


def test_secret_files_override_backend_dotenv_secret_values(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Root secret files should be the secret source even if old dotenv values exist."""
    env_file = tmp_path / ".env.dev"
    env_file.write_text(
        "DATA_ENCRYPTION_KEY=short\nCACHE_SIGNING_SECRET=short\n",
        encoding="utf-8",
    )
    (tmp_path / "data_encryption_key").write_text(TEST_DATA_ENCRYPTION_KEY, encoding="utf-8")
    (tmp_path / "cache_signing_secret").write_text(TEST_CACHE_SIGNING_SECRET, encoding="utf-8")
    settings_config: Any = {**CoreSettings.model_config, "env_file": env_file, "secrets_dir": tmp_path}
    monkeypatch.setattr(CoreSettings, "model_config", settings_config)

    settings = CoreSettings(environment=Environment.DEV)

    assert settings.data_encryption_key.get_secret_value() == TEST_DATA_ENCRYPTION_KEY
    assert settings.cache_signing_secret.get_secret_value() == TEST_CACHE_SIGNING_SECRET


def test_secret_files_override_process_environment_secret_values(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Root secret files should remain authoritative over exported secret values."""
    monkeypatch.setenv("DATA_ENCRYPTION_KEY", "short")
    monkeypatch.setenv("CACHE_SIGNING_SECRET", "short")
    (tmp_path / "data_encryption_key").write_text(TEST_DATA_ENCRYPTION_KEY, encoding="utf-8")
    (tmp_path / "cache_signing_secret").write_text(TEST_CACHE_SIGNING_SECRET, encoding="utf-8")
    settings_config: Any = {**CoreSettings.model_config, "env_file": None, "secrets_dir": tmp_path}
    monkeypatch.setattr(CoreSettings, "model_config", settings_config)

    settings = CoreSettings(environment=Environment.DEV)

    assert settings.data_encryption_key.get_secret_value() == TEST_DATA_ENCRYPTION_KEY
    assert settings.cache_signing_secret.get_secret_value() == TEST_CACHE_SIGNING_SECRET


def test_production_can_load_runtime_passwords_from_secret_files(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Production-like settings should accept runtime passwords from secrets_dir."""
    (tmp_path / "postgres_password").write_text("admin-secret", encoding="utf-8")
    (tmp_path / "database_app_password").write_text("app-secret", encoding="utf-8")
    (tmp_path / "database_migration_password").write_text("migration-secret", encoding="utf-8")
    (tmp_path / "database_backup_password").write_text("backup-secret", encoding="utf-8")
    (tmp_path / "redis_password").write_text("redis-secret", encoding="utf-8")
    (tmp_path / "bootstrap_superuser_password").write_text("superuser-secret", encoding="utf-8")
    (tmp_path / "data_encryption_key").write_text(TEST_DATA_ENCRYPTION_KEY, encoding="utf-8")
    (tmp_path / "cache_signing_secret").write_text(TEST_CACHE_SIGNING_SECRET, encoding="utf-8")

    settings_config: Any = {**CoreSettings.model_config, "env_file": None, "secrets_dir": tmp_path}
    monkeypatch.setattr(CoreSettings, "model_config", settings_config)

    db = DatabaseSettings(
        _env_file=None,
        _secrets_dir=tmp_path,
        app_user="relab_app",
        migration_user="relab_migrator",
        backup_user="relab_backup",
    )
    redis = RedisSettings(_env_file=None, _secrets_dir=tmp_path)

    kwargs = _production_core_settings_kwargs()
    # Remove the pre-built database/redis and supply secret-file-loaded ones instead
    kwargs["database"] = db
    kwargs["redis"] = redis
    # Remove secrets that should come from files
    for name in ("bootstrap_superuser_password", "data_encryption_key", "cache_signing_secret"):
        kwargs.pop(name)

    settings = CoreSettings(**kwargs)

    assert settings.database.postgres_password.get_secret_value() == "admin-secret"
    assert settings.database.app_password.get_secret_value() == "app-secret"
    assert settings.database.migration_password.get_secret_value() == "migration-secret"
    assert settings.database.backup_password.get_secret_value() == "backup-secret"
    assert settings.redis.password.get_secret_value() == "redis-secret"
    assert settings.bootstrap_superuser_password.get_secret_value() == "superuser-secret"
    assert settings.data_encryption_key.get_secret_value() == TEST_DATA_ENCRYPTION_KEY
    assert settings.cache_signing_secret.get_secret_value() == TEST_CACHE_SIGNING_SECRET


def test_production_rejects_missing_redis_secret_file(tmp_path: Path) -> None:
    """Production-like settings should fail when Redis has no password source."""
    db = DatabaseSettings(
        _env_file=None,
        _secrets_dir=tmp_path,
        app_user="relab_app",
        app_password=SecretStr("app-secret"),
        migration_user="relab_migrator",
        migration_password=SecretStr("migration-secret"),
        backup_user="relab_backup",
        backup_password=SecretStr("backup-secret"),
    )

    kwargs = _production_core_settings_kwargs()
    kwargs["database"] = db
    # redis deliberately omitted — empty password triggers the error

    with pytest.raises(ValidationError, match="REDIS_PASSWORD must not be empty"):
        CoreSettings(**{**kwargs, "redis": RedisSettings()})


def test_sync_database_url_disables_tls_by_default() -> None:
    """Sync DB URLs should explicitly disable TLS for the internal Postgres service."""
    settings = CoreSettings(
        environment=Environment.DEV,
        database=DatabaseSettings(migration_password=SecretStr("test-password")),
    )
    parsed = make_url(settings.database.sync_migration_url)
    assert parsed.query["sslmode"] == "disable"


def test_sync_database_url_supports_verify_full_tls(tmp_path: Path) -> None:
    """External Postgres deployments should be able to require full certificate verification."""
    ca_file = tmp_path / "postgres-ca.pem"
    ca_file.write_text("test CA path", encoding="utf-8")
    settings = CoreSettings(
        environment=Environment.DEV,
        database=DatabaseSettings(
            tls=True,
            tls_ca_file=ca_file,
            migration_password=SecretStr("test-password"),
        ),
    )

    parsed = make_url(settings.database.sync_migration_url)

    assert parsed.query["sslmode"] == "verify-full"
    assert parsed.query["sslrootcert"] == str(ca_file)


def test_database_tls_rejects_non_boolean_values() -> None:
    """Database TLS should stay a simple boolean toggle."""
    with pytest.raises(ValidationError, match="tls"):
        DatabaseSettings(tls="require")


def test_async_database_connect_args_disable_tls_by_default() -> None:
    """Async DB connections should not inherit accidental PGSSL* env vars by default."""
    settings = CoreSettings(environment=Environment.DEV)
    assert settings.database.async_connect_args == {"ssl": False}


def test_async_database_connect_args_verify_full_uses_ssl_context() -> None:
    """Full DB certificate verification should use a default verifying SSL context."""
    settings = CoreSettings(
        **_production_core_settings_kwargs(
            database=DatabaseSettings(
                app_user="relab_app",
                app_password=SecretStr("app-password"),
                migration_user="relab_migrator",
                migration_password=SecretStr("migration-password"),
                backup_user="relab_backup",
                backup_password=SecretStr("backup-password"),
                tls=True,
            )
        )
    )

    connect_args = settings.database.async_connect_args

    assert isinstance(connect_args["ssl"], ssl.SSLContext)
    assert connect_args["ssl"].verify_mode == ssl.CERT_REQUIRED
    assert connect_args["ssl"].check_hostname is True


def test_cache_url_uses_rediss_when_redis_tls_is_enabled() -> None:
    """Redis TLS should be reflected in the cache URL scheme."""
    settings = CoreSettings(
        environment=Environment.DEV,
        redis=RedisSettings(
            host="redis.internal",
            port=6379,
            db=2,
            password=SecretStr("p@ss:word/with?chars"),
            tls=True,
        ),
    )

    url = settings.redis.cache_url

    RedisDsn(url)
    assert url == "rediss://:p%40ss%3Aword%2Fwith%3Fchars@redis.internal:6379/2"


@pytest.mark.parametrize(
    ("field", "url", "message"),
    [
        ("api_public_url", "http://api.cml-relab.org", "API_PUBLIC_URL must use https"),
        ("app_public_url", "http://app.cml-relab.org", "APP_PUBLIC_URL must use https"),
        ("site_public_url", "http://cml-relab.org", "SITE_PUBLIC_URL must use https"),
        ("docs_public_url", "http://docs.cml-relab.org", "DOCS_PUBLIC_URL must use https"),
    ],
)
def test_production_requires_https_origins(field: str, url: str, message: str) -> None:
    """Production-like environments should use HTTPS for external URLs."""
    with pytest.raises(ValidationError, match=message):
        CoreSettings(**_production_core_settings_kwargs(**{field: HttpUrl(url)}))


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("app_user", "postgres", "DATABASE_APP_USER must not use the bootstrap/admin role"),
        ("migration_user", "postgres", "DATABASE_MIGRATION_USER must not use the bootstrap/admin role"),
        ("backup_user", "postgres", "DATABASE_BACKUP_USER must not use the bootstrap/admin role"),
        ("app_password", SecretStr(""), "DATABASE_APP_PASSWORD must not be empty"),
        ("migration_password", SecretStr(""), "DATABASE_MIGRATION_PASSWORD must not be empty"),
        ("backup_password", SecretStr(""), "DATABASE_BACKUP_PASSWORD must not be empty"),
    ],
)
def test_production_rejects_unsafe_database_role_settings(field: str, value: str | SecretStr, message: str) -> None:
    """Production should fail fast when role credentials break least privilege."""
    base_db = _database_role_kwargs()["database"]
    overridden = DatabaseSettings(**{**base_db.model_dump(), field: value})
    with pytest.raises(ValidationError, match=message):
        CoreSettings(**_production_core_settings_kwargs(database=overridden))


def test_production_rejects_duplicate_database_runtime_roles() -> None:
    """Production database runtime, migration, and backup roles must be distinct."""
    base_db = _database_role_kwargs()["database"]
    dup_db = DatabaseSettings(**{**base_db.model_dump(), "migration_user": "relab_app"})
    with pytest.raises(ValidationError, match="Database app, migration, and backup users must be distinct"):
        CoreSettings(**_production_core_settings_kwargs(database=dup_db))


def test_otel_enabled_tracks_endpoint() -> None:
    """Telemetry is enabled iff an exporter endpoint is configured."""
    settings = CoreSettings(environment=Environment.DEV)
    assert settings.otel_enabled is False

    settings = CoreSettings(
        environment=Environment.DEV,
        otel_exporter_otlp_endpoint="http://otel.internal:4318/v1/traces",
    )
    assert settings.otel_enabled is True


def test_dev_maps_to_development_file(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """DEV environment should map to .env.dev."""
    monkeypatch.setenv("ENVIRONMENT", "dev")
    assert get_env_file(tmp_path) == tmp_path / ".env.dev"


def test_staging_uses_no_dotenv_file(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """STAGING should use process env and secrets, not backend .env files."""
    monkeypatch.setenv("ENVIRONMENT", "staging")
    assert get_env_file(tmp_path) is None


def test_prod_uses_no_dotenv_file(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """PROD should use process env and secrets, not backend .env files."""
    monkeypatch.setenv("ENVIRONMENT", "prod")
    assert get_env_file(tmp_path) is None


def test_testing_maps_to_test_file(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """TESTING environment should map to .env.test."""
    monkeypatch.setenv("ENVIRONMENT", "testing")
    assert get_env_file(tmp_path) == tmp_path / ".env.test"


def test_defaults_to_development_when_unset(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """When ENVIRONMENT is unset, it should default to DEV and map to .env.dev."""
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    assert get_env_file(tmp_path) == tmp_path / ".env.dev"


def test_unknown_environment_uses_no_dotenv_file(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Custom environments should use process env and secrets only."""
    monkeypatch.setenv("ENVIRONMENT", "ci")
    assert get_env_file(tmp_path) is None


def test_prefers_docker_runtime_secrets(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Docker /run/secrets should win over local root secrets when mounted."""
    docker_secrets = tmp_path / "run" / "secrets"
    local_secrets = tmp_path / "secrets" / "dev"
    docker_secrets.mkdir(parents=True)
    local_secrets.mkdir(parents=True)
    monkeypatch.setenv("ENVIRONMENT", "dev")

    assert get_secrets_dir(tmp_path, docker_secrets_dir=docker_secrets) == docker_secrets


def test_uses_root_environment_secret_dir_for_local_dev(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Local backend processes should read root secrets/<env> when Docker secrets are absent."""
    local_secrets = tmp_path / "secrets" / "dev"
    local_secrets.mkdir(parents=True)
    monkeypatch.setenv("ENVIRONMENT", "dev")

    assert get_secrets_dir(tmp_path, docker_secrets_dir=tmp_path / "missing") == local_secrets
