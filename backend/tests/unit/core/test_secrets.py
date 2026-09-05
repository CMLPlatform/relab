"""Tests for runtime secret helpers."""

import logging
from typing import TYPE_CHECKING

from pydantic import BaseModel, SecretStr

from app.core.secrets import find_placeholder_secret_names, warn_on_placeholder_secrets

if TYPE_CHECKING:
    import pytest


class _Settings(BaseModel):
    google_oauth_client_secret: SecretStr = SecretStr("")
    smtp_password: SecretStr = SecretStr("")
    not_a_secret: str = "plain"


def test_find_placeholder_secret_names_flags_only_placeholders() -> None:
    """Only SecretStr fields still holding the deploy placeholder are reported."""
    settings = _Settings(
        google_oauth_client_secret=SecretStr("replace-me-dev-google_oauth_client_secret"),
        smtp_password=SecretStr("GOCSPX-a-real-looking-value"),
    )
    assert find_placeholder_secret_names(settings) == ["GOOGLE_OAUTH_CLIENT_SECRET"]


def test_find_placeholder_secret_names_empty_when_all_real() -> None:
    """Real secret values produce no findings."""
    settings = _Settings(
        google_oauth_client_secret=SecretStr("real"),
        smtp_password=SecretStr("real"),
    )
    assert find_placeholder_secret_names(settings) == []


def test_warn_on_placeholder_secrets_logs_and_returns(caplog: pytest.LogCaptureFixture) -> None:
    """A placeholder secret emits a warning and is returned to the caller."""
    settings = _Settings(google_oauth_client_secret=SecretStr("replace-me-dev-x"))
    with caplog.at_level(logging.WARNING):
        offenders = warn_on_placeholder_secrets(logging.getLogger("test"), settings)
    assert offenders == ["GOOGLE_OAUTH_CLIENT_SECRET"]
    assert "placeholder" in caplog.text.lower()


def test_warn_on_placeholder_secrets_silent_when_clean(caplog: pytest.LogCaptureFixture) -> None:
    """Clean settings log nothing and return no offenders."""
    settings = _Settings(google_oauth_client_secret=SecretStr("real"))
    with caplog.at_level(logging.WARNING):
        offenders = warn_on_placeholder_secrets(logging.getLogger("test"), settings)
    assert offenders == []
    assert caplog.text == ""
