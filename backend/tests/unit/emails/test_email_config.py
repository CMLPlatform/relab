"""Tests for auth email configuration."""

from pydantic import EmailStr, TypeAdapter

from app.api.auth.config import settings as auth_settings
from app.api.auth.utils.email_config import email_conf


def test_email_config_uses_a_valid_sender_address() -> None:
    """The mail config should always expose a valid sender address."""
    sender = email_conf.MAIL_FROM

    assert sender
    assert TypeAdapter(EmailStr).validate_python(sender) == sender


def test_email_config_reuses_the_parsed_sender_name() -> None:
    """The mail config should reuse the shared parsed sender config."""
    sender = auth_settings.email.sender

    assert sender is not None
    assert sender.email == email_conf.MAIL_FROM
    assert sender.name == email_conf.MAIL_FROM_NAME
