"""Unit tests for the auth module configuration."""

import pytest
from pydantic import SecretStr

from app.api.auth.config import AuthSettings


@pytest.mark.unit
class TestAuthSettingsDefaults:
    """AuthSettings should produce safe, predictable defaults when no env file is present."""

    def test_oauth_redirect_lists_default_empty(self) -> None:
        """OAuth redirect path/native allowlists default empty."""
        settings = AuthSettings()
        assert settings.oauth_allowed_redirect_paths == []
        assert settings.oauth_allowed_native_redirect_uris == []

    def test_email_defaults_to_username(self) -> None:
        """Resolved sender fields should fall back to the SMTP username when omitted."""
        settings = AuthSettings(
            email_username="noreply@example.com",
            email_from="",
            email_reply_to="",
        )
        assert settings.email.sender is not None
        assert settings.email.reply_to is not None
        assert settings.email.sender.email == "noreply@example.com"
        assert settings.email.reply_to.email == "noreply@example.com"

    def test_email_parsing_reuses_sender_when_reply_to_is_omitted(self) -> None:
        """Parsed sender/reply-to values should share the same fallback logic."""
        settings = AuthSettings(
            email_username="smtp@example.com",
            email_from="Reverse Engineering Lab <noreply@example.com>",
            email_reply_to="",
        )
        assert settings.email.sender is not None
        assert settings.email.reply_to is not None
        assert settings.email.sender.name == "Reverse Engineering Lab"
        assert settings.email.sender.email == "noreply@example.com"
        assert settings.email.reply_to == settings.email.sender

    def test_email_recipient_uses_shared_parser(self) -> None:
        """Recipients should be parsed through the shared email config."""
        settings = AuthSettings()
        recipient = settings.email.recipient("person@example.com")

        assert recipient.name == "person"
        assert recipient.email == "person@example.com"

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
        assert settings.rate_limit_login_attempts_per_minute == 3
        assert settings.rate_limit_register_attempts_per_hour == 5
        assert settings.rate_limit_password_reset_attempts_per_hour == 3

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
        secret = "my-test-jwt-secret"
        settings = AuthSettings(fastapi_users_secret=SecretStr(secret))
        assert settings.fastapi_users_secret.get_secret_value() == secret

    def test_oauth_redirect_paths_can_be_set(self) -> None:
        """OAuth allowed paths can be configured via constructor."""
        paths = ["/auth/callback", "/oauth/complete"]
        settings = AuthSettings(oauth_allowed_redirect_paths=paths)
        assert settings.oauth_allowed_redirect_paths == paths

    def test_rate_limit_can_be_overridden(self) -> None:
        """Rate limiting parameters accept custom values."""
        settings = AuthSettings(rate_limit_login_attempts_per_minute=10, rate_limit_password_reset_attempts_per_hour=8)
        assert settings.rate_limit_login_attempts_per_minute == 10
        assert settings.rate_limit_password_reset_attempts_per_hour == 8

    def test_explicit_email_from_and_reply_to_are_preserved(self) -> None:
        """Explicit sender overrides should win over the username fallback."""
        settings = AuthSettings(
            email_username="smtp@example.com",
            email_from="Sender <sender@example.com>",
            email_reply_to="reply@example.com",
        )
        assert settings.email_from == "Sender <sender@example.com>"
        assert settings.email_reply_to == "reply@example.com"
