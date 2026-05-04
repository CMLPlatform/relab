"""Tests for email provider configuration."""

import pytest
from pydantic import SecretStr, ValidationError

from app.api.auth.config import AuthSettings, EmailProviderName, GraphEmailSettings
from app.api.auth.services.email.providers import MicrosoftGraphEmailProvider, SmtpEmailProvider, build_email_provider
from app.core.config.models import Environment

VALID_SECRET = "x" * 32


def test_email_provider_defaults_to_smtp() -> None:
    """SMTP remains the default provider for backward compatibility."""
    settings = AuthSettings()

    assert settings.email_provider == EmailProviderName.SMTP


def test_build_email_provider_uses_smtp_by_default() -> None:
    """Default auth settings should build an SMTP provider."""
    settings = AuthSettings(
        email_host="smtp.example.com",
        email_username="relab@example.com",
        email_password=SecretStr("password"),
        email_from="RELab <relab@example.com>",
        email_reply_to="relab@example.com",
    )

    provider = build_email_provider(settings=settings, suppress_send=True)

    assert isinstance(provider, SmtpEmailProvider)


def test_build_email_provider_uses_microsoft_graph_when_configured() -> None:
    """Graph provider should be selected entirely by config."""
    settings = AuthSettings(
        email_provider=EmailProviderName.MICROSOFT_GRAPH,
        email_from="RELab <relab@example.com>",
        email_reply_to="support@example.com",
        microsoft_graph_tenant_id="tenant-id",
        microsoft_graph_client_id="client-id",
        microsoft_graph_client_secret=SecretStr("client-secret"),
        microsoft_graph_sender_user="relab@example.com",
    )

    provider = build_email_provider(settings=settings)

    assert isinstance(provider, MicrosoftGraphEmailProvider)


def test_graph_email_settings_require_all_credentials() -> None:
    """Graph settings should fail fast when credentials are incomplete."""
    with pytest.raises(ValidationError):
        GraphEmailSettings(
            tenant_id="tenant-id",
            client_id="",
            client_secret=SecretStr(""),
            sender_user="relab@example.com",
            save_to_sent_items=False,
        )


def test_production_validation_is_provider_specific_for_graph() -> None:
    """Graph production config should not require SMTP host credentials."""
    settings = AuthSettings(
        environment=Environment.PROD,
        fastapi_users_secret=SecretStr(VALID_SECRET),
        oauth_state_secret=SecretStr(VALID_SECRET),
        google_oauth_client_id=SecretStr("google-id"),
        google_oauth_client_secret=SecretStr("google-secret"),
        github_oauth_client_id=SecretStr("github-id"),
        github_oauth_client_secret=SecretStr("github-secret"),
        email_provider=EmailProviderName.MICROSOFT_GRAPH,
        email_from="RELab <relab@example.com>",
        email_reply_to="support@example.com",
        microsoft_graph_tenant_id="tenant-id",
        microsoft_graph_client_id="client-id",
        microsoft_graph_client_secret=SecretStr("client-secret"),
        microsoft_graph_sender_user="relab@example.com",
    )

    assert settings.email_provider == EmailProviderName.MICROSOFT_GRAPH


def test_production_validation_requires_graph_credentials() -> None:
    """Graph production config should require Graph credentials."""
    with pytest.raises(ValueError, match="MICROSOFT_GRAPH_CLIENT_ID"):
        AuthSettings(
            environment=Environment.PROD,
            fastapi_users_secret=SecretStr(VALID_SECRET),
            oauth_state_secret=SecretStr(VALID_SECRET),
            google_oauth_client_id=SecretStr("google-id"),
            google_oauth_client_secret=SecretStr("google-secret"),
            github_oauth_client_id=SecretStr("github-id"),
            github_oauth_client_secret=SecretStr("github-secret"),
            email_provider=EmailProviderName.MICROSOFT_GRAPH,
            email_from="RELab <relab@example.com>",
            email_reply_to="support@example.com",
            microsoft_graph_tenant_id="tenant-id",
            microsoft_graph_sender_user="relab@example.com",
        )
