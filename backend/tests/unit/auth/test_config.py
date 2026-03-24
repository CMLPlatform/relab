"""Unit tests for the auth module configuration."""

import pytest
from pydantic import SecretStr

from app.api.auth.config import AuthSettings


@pytest.mark.unit
class TestAuthSettingsDefaults:
    """AuthSettings should produce safe, predictable defaults when no env file is present."""

    def test_secret_fields_accept_empty_values(self) -> None:
        """Secrets can be explicitly set to empty strings (safe for dev)."""
        settings = AuthSettings(
            fastapi_users_secret="",
            newsletter_secret="",
            google_oauth_client_secret="",
            github_oauth_client_secret="",
            email_password="",
        )
        assert settings.fastapi_users_secret.get_secret_value() == ""
        assert settings.newsletter_secret.get_secret_value() == ""
        assert settings.google_oauth_client_secret.get_secret_value() == ""
        assert settings.github_oauth_client_secret.get_secret_value() == ""
        assert settings.email_password.get_secret_value() == ""

    def test_secret_fields_are_secretstr(self) -> None:
        """Secret fields are wrapped in SecretStr so they are not exposed in repr/logs."""
        settings = AuthSettings()
        assert isinstance(settings.fastapi_users_secret, SecretStr)
        assert isinstance(settings.email_password, SecretStr)

    def test_oauth_redirect_lists_default_empty(self) -> None:
        """OAuth redirect path/native allowlists default empty."""
        settings = AuthSettings()
        assert settings.oauth_allowed_redirect_paths == []
        assert settings.oauth_allowed_native_redirect_uris == []

    def test_email_from_and_reply_to_default_to_username(self) -> None:
        """Sender fields should fall back to the SMTP username when omitted."""
        settings = AuthSettings(
            email_username="noreply@example.com",
            email_from="",
            email_reply_to="",
        )
        assert settings.email_from == "noreply@example.com"
        assert settings.email_reply_to == "noreply@example.com"

    def test_token_ttl_defaults(self) -> None:
        """Token TTL defaults encode the expected business rules."""
        settings = AuthSettings()
        assert settings.access_token_ttl_seconds == 60 * 15  # 15 min
        assert settings.reset_password_token_ttl_seconds == 60 * 60  # 1 h
        assert settings.verification_token_ttl_seconds == 60 * 60 * 24  # 1 day
        assert settings.newsletter_unsubscription_token_ttl_seconds == 60 * 60 * 24 * 30  # 30 days

    def test_session_defaults(self) -> None:
        """Session and refresh-token defaults are sensible."""
        settings = AuthSettings()
        assert settings.refresh_token_expire_days == 30
        assert settings.session_id_length == 32

    def test_rate_limit_defaults(self) -> None:
        """Rate limiting defaults are enabled with conservative values."""
        settings = AuthSettings()
        assert settings.rate_limit_login_attempts == 5
        assert settings.rate_limit_window_seconds == 300  # 5 min

    def test_youtube_api_scopes_default(self) -> None:
        """YouTube API scopes default to the expected list of four scopes."""
        settings = AuthSettings()
        assert len(settings.youtube_api_scopes) == 4
        assert all(s.startswith("https://www.googleapis.com/auth/youtube") for s in settings.youtube_api_scopes)


@pytest.mark.unit
class TestAuthSettingsOverrides:
    """AuthSettings should accept constructor-level overrides for all fields."""

    def test_secrets_can_be_set_via_constructor(self) -> None:
        """Secrets supplied in __init__ are stored and retrievable."""
        secret = "my-test-jwt-secret"  # noqa: S105
        settings = AuthSettings(fastapi_users_secret=secret)
        assert settings.fastapi_users_secret.get_secret_value() == secret

    def test_oauth_redirect_paths_can_be_set(self) -> None:
        """OAuth allowed paths can be configured via constructor."""
        paths = ["/auth/callback", "/oauth/complete"]
        settings = AuthSettings(oauth_allowed_redirect_paths=paths)
        assert settings.oauth_allowed_redirect_paths == paths

    def test_rate_limit_can_be_overridden(self) -> None:
        """Rate limiting parameters accept custom values."""
        settings = AuthSettings(rate_limit_login_attempts=10, rate_limit_window_seconds=600)
        assert settings.rate_limit_login_attempts == 10
        assert settings.rate_limit_window_seconds == 600

    def test_explicit_email_from_and_reply_to_are_preserved(self) -> None:
        """Explicit sender overrides should win over the username fallback."""
        settings = AuthSettings(
            email_username="smtp@example.com",
            email_from="Sender <sender@example.com>",
            email_reply_to="reply@example.com",
        )
        assert settings.email_from == "Sender <sender@example.com>"
        assert settings.email_reply_to == "reply@example.com"
