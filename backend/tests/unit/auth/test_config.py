"""Unit tests for the auth module configuration."""

from typing import TYPE_CHECKING

import pytest
from pydantic import SecretStr
from pydantic_core import ValidationError

from app.api.auth.config import AuthSettings
from app.core.config import Environment

if TYPE_CHECKING:
    from pathlib import Path
    from typing import Any

VALID_SECRET = "x" * 32


def test_oauth_redirect_allowlist_defaults_from_app_public_url() -> None:
    """OAuth redirect URI allowlist derives from the public app origin."""
    settings = AuthSettings(app_public_url="https://app.example.com")
    assert settings.oauth_allowed_redirect_uris == [
        "https://app.example.com/login",
        "https://app.example.com/account",
        "relab-app://login",
        "relab-app://account",
    ]


def test_email_defaults_to_username() -> None:
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


def test_email_parsing_reuses_sender_when_reply_to_is_omitted() -> None:
    """Parsed sender/reply-to values should share the same fallback logic."""
    settings = AuthSettings(
        smtp_username="smtp@example.com",
        email_from="Relab <noreply@example.com>",
        email_reply_to="",
    )
    assert settings.email.sender is not None
    assert settings.email.reply_to is not None
    assert settings.email.sender.name == "Relab"
    assert settings.email.sender.email == "noreply@example.com"
    assert settings.email.reply_to == settings.email.sender


def test_email_recipient_uses_shared_parser() -> None:
    """Recipients should be parsed through the shared email config."""
    settings = AuthSettings()
    recipient = settings.email.recipient("person@example.com")

    assert recipient.name == "person"
    assert recipient.email == "person@example.com"


def test_token_ttl_defaults() -> None:
    """Token TTL defaults encode the expected business rules."""
    settings = AuthSettings()
    assert settings.access_token_ttl_seconds == 60 * 15  # 15 min
    assert settings.oauth_state_token_ttl_seconds == 60 * 10  # 10 min
    assert settings.reset_password_token_ttl_seconds == 60 * 60  # 1 h
    assert settings.verification_token_ttl_seconds == 60 * 60 * 24  # 1 day


def test_session_defaults() -> None:
    """Session and refresh-token defaults are sensible."""
    settings = AuthSettings()
    assert settings.refresh_token_expire_days == 30
    assert settings.refresh_session_absolute_expire_days == 30


def test_rate_limit_defaults() -> None:
    """Rate limiting defaults are enabled with conservative values."""
    settings = AuthSettings()
    assert settings.rate_limit_login_attempts_per_minute == 3
    assert settings.rate_limit_register_attempts_per_hour == 5
    assert settings.rate_limit_password_reset_attempts_per_hour == 3


def test_secrets_can_be_set_via_constructor() -> None:
    """Secrets supplied in __init__ are stored and retrievable."""
    secret = VALID_SECRET
    settings = AuthSettings(auth_token_secret=SecretStr(secret))
    assert settings.auth_token_secret.get_secret_value() == secret


def test_auth_token_secret_rejects_short_values_outside_testing() -> None:
    """Auth JWT keys should meet the 32-byte minimum outside test runs."""
    with pytest.raises(ValidationError, match="AUTH_TOKEN_SECRET must be at least 32 bytes"):
        AuthSettings(environment=Environment.DEV, auth_token_secret=SecretStr("short"))


def test_auth_token_secret_allows_fixed_testing_value() -> None:
    """Tests can keep deterministic auth secrets for reproducibility."""
    settings = AuthSettings(environment=Environment.TESTING, auth_token_secret=SecretStr("short"))

    assert settings.auth_token_secret.get_secret_value() == "short"


def test_oauth_state_secret_falls_back_to_auth_token_secret_in_dev() -> None:
    """Dev and test can omit the dedicated OAuth state key while migrating local envs."""
    settings = AuthSettings(
        environment=Environment.DEV,
        auth_token_secret=SecretStr(VALID_SECRET),
        oauth_state_secret=SecretStr(""),
    )

    assert settings.oauth_state_secret.get_secret_value() == VALID_SECRET


def test_oauth_state_secret_is_required_in_production_like_environments() -> None:
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


def test_oauth_state_secret_rejects_short_values_in_production_like_environments() -> None:
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


def test_oauth_redirect_uris_can_be_set() -> None:
    """OAuth allowed redirect URIs can be configured via constructor."""
    redirect_uris = ["https://app.example.com/login", "relab-app://account"]
    settings = AuthSettings(oauth_allowed_redirect_uris=redirect_uris)
    assert settings.oauth_allowed_redirect_uris == redirect_uris


def test_oauth_redirect_uris_are_normalized() -> None:
    """OAuth allowed redirect URIs normalize scheme, host, and trailing slash."""
    settings = AuthSettings(oauth_allowed_redirect_uris=["HTTPS://APP.EXAMPLE.COM/login/"])
    assert settings.oauth_allowed_redirect_uris == ["https://app.example.com/login"]


def test_oauth_redirect_uris_reject_query_strings() -> None:
    """OAuth allowed redirect URIs should not include attacker-controlled query slots."""
    with pytest.raises(ValidationError, match="without credentials, query, or fragment"):
        AuthSettings(oauth_allowed_redirect_uris=["https://app.example.com/login?next=/account"])


def test_rate_limit_can_be_overridden() -> None:
    """Rate limiting parameters accept custom values."""
    settings = AuthSettings(rate_limit_login_attempts_per_minute=10, rate_limit_password_reset_attempts_per_hour=8)
    assert settings.rate_limit_login_attempts_per_minute == 10
    assert settings.rate_limit_password_reset_attempts_per_hour == 8


def test_explicit_email_from_and_reply_to_are_preserved() -> None:
    """Explicit sender overrides should win over the username fallback."""
    settings = AuthSettings(
        smtp_username="smtp@example.com",
        email_from="Sender <sender@example.com>",
        email_reply_to="reply@example.com",
    )
    assert settings.email_from == "Sender <sender@example.com>"
    assert settings.email_reply_to == "reply@example.com"


def test_auth_settings_load_runtime_secrets_from_secret_files(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Auth settings should load secret material from secrets_dir."""
    valid_secret = "x" * 32
    (tmp_path / "auth_token_secret").write_text(valid_secret, encoding="utf-8")
    (tmp_path / "oauth_state_secret").write_text(valid_secret, encoding="utf-8")
    (tmp_path / "google_oauth_client_secret").write_text("google-secret", encoding="utf-8")
    (tmp_path / "github_oauth_client_secret").write_text("github-secret", encoding="utf-8")
    (tmp_path / "smtp_password").write_text("email-secret", encoding="utf-8")
    settings_config: Any = {**AuthSettings.model_config, "env_file": None, "secrets_dir": tmp_path}
    monkeypatch.setattr(AuthSettings, "model_config", settings_config)

    settings = AuthSettings(
        environment=Environment.PROD,
        google_oauth_client_id=SecretStr("google-client-id"),
        github_oauth_client_id=SecretStr("github-client-id"),
        smtp_host="smtp.example.com",
        smtp_username="sender@example.com",
        email_from="Relab <sender@example.com>",
        email_reply_to="relab@example.com",
    )

    assert settings.auth_token_secret.get_secret_value() == valid_secret
    assert settings.oauth_state_secret.get_secret_value() == valid_secret
    assert settings.google_oauth_client_secret.get_secret_value() == "google-secret"
    assert settings.github_oauth_client_secret.get_secret_value() == "github-secret"
    assert settings.smtp_password.get_secret_value() == "email-secret"


def test_auth_settings_require_secrets_in_production() -> None:
    """Auth settings should reject blank prod/staging secrets and email config."""
    with pytest.raises(ValidationError, match="Auth settings validation failed"):
        AuthSettings(
            environment=Environment.PROD,
            auth_token_secret=SecretStr("x" * 32),
            google_oauth_client_id=SecretStr(""),
            google_oauth_client_secret=SecretStr(""),
            github_oauth_client_id=SecretStr(""),
            github_oauth_client_secret=SecretStr(""),
            smtp_host="",
            smtp_username="",
            smtp_password=SecretStr(""),
            email_from="",
            email_reply_to="",
        )
