"""Unit tests for application configuration.

Tests CORS settings, host allowlists, and environment file resolution.
"""

from typing import TYPE_CHECKING

import pytest
from pydantic import HttpUrl, SecretStr
from pydantic_core import ValidationError

from app.core.config import CoreSettings, Environment
from app.core.env import get_env_file

if TYPE_CHECKING:
    from pathlib import Path


@pytest.mark.unit
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
            frontend_web_url=HttpUrl("https://web-test.cml-relab.org/"),
            frontend_app_url=HttpUrl("https://app-test.cml-relab.org/"),
            cors_origin_regex=None,
            postgres_password=SecretStr("test-password"),
            redis_password=SecretStr("test-password"),
            superuser_password=SecretStr("test-password"),
            superuser_email="test@example.com",
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
            cors_origin_regex=None,
            postgres_password=SecretStr("test-password"),
            redis_password=SecretStr("test-password"),
            superuser_password=SecretStr("test-password"),
            superuser_email="test@example.com",
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
                postgres_password=SecretStr("test-password"),
                redis_password=SecretStr("test-password"),
                superuser_password=SecretStr("test-password"),
                superuser_email="test@example.com",
            )

    def test_production_requires_non_default_secrets(self) -> None:
        """Production config should fail fast when required secrets are missing."""
        with pytest.raises(ValidationError, match="Production security check failed"):
            CoreSettings(environment=Environment.PROD)


@pytest.mark.unit
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
