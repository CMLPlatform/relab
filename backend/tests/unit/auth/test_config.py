"""Unit tests for the auth module configuration."""

import pytest
from pydantic import SecretStr
from pydantic_core import ValidationError

from app.api.auth.config import AuthSettings
from app.core.config import Environment

VALID_SECRET = "x" * 32


class TestAuthSettingsDefaults:
    """AuthSettings should produce safe, predictable defaults when no env file is present."""

    def test_oauth_redirect_allowlist_defaults_empty(self) -> None:
        """OAuth redirect URI allowlist defaults empty."""
        settings = AuthSettings()
        assert settings.oauth_allowed_redirect_uris == []

    def test_email_defaults_to_username(self) -> None:
        """Resolved sender fields should fall back to the SMTP username when omitted."""
        settings = AuthSettings(
            smtp_username="noreply@example.com",
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
            smtp_username="smtp@example.com",
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
        assert settings.oauth_state_token_ttl_seconds == 60 * 10  # 10 min
        assert settings.reset_password_token_ttl_seconds == 60 * 60  # 1 h
        assert settings.verification_token_ttl_seconds == 60 * 60 * 24  # 1 day

    def test_session_defaults(self) -> None:
        """Session and refresh-token defaults are sensible."""
        settings = AuthSettings()
        assert settings.refresh_token_expire_days == 30
        assert settings.refresh_session_absolute_expire_days == 30

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


class TestAuthSettingsOverrides:
    """AuthSettings should accept constructor-level overrides for all fields."""

    def test_secrets_can_be_set_via_constructor(self) -> None:
        """Secrets supplied in __init__ are stored and retrievable."""
        secret = VALID_SECRET
        settings = AuthSettings(auth_token_secret=SecretStr(secret))
        assert settings.auth_token_secret.get_secret_value() == secret

    def test_auth_token_secret_rejects_short_values_outside_testing(self) -> None:
        """Auth JWT keys should meet the 32-byte minimum outside test runs."""
        with pytest.raises(ValidationError, match="AUTH_TOKEN_SECRET must be at least 32 bytes"):
            AuthSettings(environment=Environment.DEV, auth_token_secret=SecretStr("short"))

    def test_auth_token_secret_allows_fixed_testing_value(self) -> None:
        """Tests can keep deterministic auth secrets for reproducibility."""
        settings = AuthSettings(environment=Environment.TESTING, auth_token_secret=SecretStr("short"))

        assert settings.auth_token_secret.get_secret_value() == "short"

    def test_oauth_state_secret_falls_back_to_auth_token_secret_in_dev(self) -> None:
        """Dev and test can omit the dedicated OAuth state key while migrating local envs."""
        settings = AuthSettings(
            environment=Environment.DEV,
            auth_token_secret=SecretStr(VALID_SECRET),
            oauth_state_secret=SecretStr(""),
        )

        assert settings.oauth_state_secret.get_secret_value() == VALID_SECRET

    def test_oauth_state_secret_is_required_in_production_like_environments(self) -> None:
        """Production-like environments should use separate keys for auth tokens and OAuth state."""
        with pytest.raises(ValidationError, match="OAUTH_STATE_SECRET must not be empty"):
            AuthSettings(
                environment=Environment.PROD,
                auth_token_secret=SecretStr(VALID_SECRET),
                oauth_state_secret=SecretStr(""),
                google_oauth_client_id=SecretStr("google-client"),
                google_oauth_client_secret=SecretStr("google-secret"),
                github_oauth_client_id=SecretStr("github-client"),
                github_oauth_client_secret=SecretStr("github-secret"),
                smtp_host="smtp.example.com",
                smtp_username="smtp@example.com",
                smtp_password=SecretStr("email-password"),
                email_from="Sender <sender@example.com>",
                email_reply_to="reply@example.com",
            )

    def test_oauth_state_secret_rejects_short_values_in_production_like_environments(self) -> None:
        """Dedicated OAuth state keys should meet the same 32-byte floor in deployments."""
        with pytest.raises(ValidationError, match="OAUTH_STATE_SECRET must be at least 32 bytes"):
            AuthSettings(
                environment=Environment.STAGING,
                auth_token_secret=SecretStr(VALID_SECRET),
                oauth_state_secret=SecretStr("short"),
                google_oauth_client_id=SecretStr("google-client"),
                google_oauth_client_secret=SecretStr("google-secret"),
                github_oauth_client_id=SecretStr("github-client"),
                github_oauth_client_secret=SecretStr("github-secret"),
                smtp_host="smtp.example.com",
                smtp_username="smtp@example.com",
                smtp_password=SecretStr("email-password"),
                email_from="Sender <sender@example.com>",
                email_reply_to="reply@example.com",
            )

    def test_oauth_redirect_uris_can_be_set(self) -> None:
        """OAuth allowed redirect URIs can be configured via constructor."""
        redirect_uris = ["https://app.example.com/login", "relab-app://profile"]
        settings = AuthSettings(oauth_allowed_redirect_uris=redirect_uris)
        assert settings.oauth_allowed_redirect_uris == redirect_uris

    def test_oauth_redirect_uris_are_normalized(self) -> None:
        """OAuth allowed redirect URIs normalize scheme, host, and trailing slash."""
        settings = AuthSettings(oauth_allowed_redirect_uris=["HTTPS://APP.EXAMPLE.COM/login/"])
        assert settings.oauth_allowed_redirect_uris == ["https://app.example.com/login"]

    def test_oauth_redirect_uris_reject_query_strings(self) -> None:
        """OAuth allowed redirect URIs should not include attacker-controlled query slots."""
        with pytest.raises(ValidationError, match="without credentials, query, or fragment"):
            AuthSettings(oauth_allowed_redirect_uris=["https://app.example.com/login?next=/profile"])

    def test_rate_limit_can_be_overridden(self) -> None:
        """Rate limiting parameters accept custom values."""
        settings = AuthSettings(rate_limit_login_attempts_per_minute=10, rate_limit_password_reset_attempts_per_hour=8)
        assert settings.rate_limit_login_attempts_per_minute == 10
        assert settings.rate_limit_password_reset_attempts_per_hour == 8

    def test_explicit_email_from_and_reply_to_are_preserved(self) -> None:
        """Explicit sender overrides should win over the username fallback."""
        settings = AuthSettings(
            smtp_username="smtp@example.com",
            email_from="Sender <sender@example.com>",
            email_reply_to="reply@example.com",
        )
        assert settings.email_from == "Sender <sender@example.com>"
        assert settings.email_reply_to == "reply@example.com"
