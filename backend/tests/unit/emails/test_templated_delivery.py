"""Tests for the typed shared email delivery boundary."""

import logging
from unittest.mock import AsyncMock

import anyio
import pytest
from aiosmtplib.errors import SMTPRecipientRefused, SMTPRecipientsRefused

from app.api.auth.services.email import service
from app.api.auth.services.email.providers import EmailMessage
from app.api.auth.services.email.service import send_templated_email
from app.api.auth.services.email.templates import REGISTRATION_TEMPLATE
from app.api.common.rate_limiting import rate_limit_bucket_key
from app.core.logging import build_json_formatter


def _message() -> EmailMessage:
    """A minimal message; these tests exercise delivery, not rendering."""
    return EmailMessage(
        subject="Subject",
        recipients=["user@example.com"],
        sender="relab@example.com",
        reply_to=[],
        html_body="<p>body</p>",
    )


async def test_send_templated_email_rejects_missing_required_context() -> None:
    """Template rendering should fail fast when required context is missing."""
    provider = AsyncMock()

    with pytest.raises(ValueError, match="verification_link"):
        await send_templated_email(
            to_email="user@example.com",
            subject="Welcome",
            template_name=REGISTRATION_TEMPLATE,
            template_body={"username": "tester"},
            provider=provider,
        )

    provider.send.assert_not_awaited()


async def test_transient_send_failure_is_retried(monkeypatch: pytest.MonkeyPatch) -> None:
    """A refused first attempt must not strand the user's verification link."""
    monkeypatch.setattr(service, "_SEND_BACKOFF_SECONDS", 0)
    provider = AsyncMock()
    provider.send.side_effect = [OSError("connection refused"), None]

    await service._send_and_log(provider, _message(), "Email", "u***@example.com")

    assert provider.send.await_count == 2


async def test_send_gives_up_after_the_attempt_budget(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """A persistent outage is logged and swallowed, never raised past the response."""
    monkeypatch.setattr(service, "_SEND_BACKOFF_SECONDS", 0)
    provider = AsyncMock()
    provider.send.side_effect = OSError("smtp down")

    with caplog.at_level(logging.ERROR):
        await service._send_and_log(provider, _message(), "Email", "u***@example.com")

    assert provider.send.await_count == service._SEND_ATTEMPTS
    assert "failed for u***@example.com" in caplog.text


def test_email_log_token_carries_no_part_of_the_address() -> None:
    """The label must leak neither the local part nor the domain."""
    token = service.email_log_token("Alice.Smith@Gmail.com")

    assert "alice" not in token.lower()
    assert "gmail" not in token.lower()
    assert "@" not in token


def test_email_log_token_is_stable_and_case_insensitive() -> None:
    """Two lines about one address must match, or the label is useless to operations."""
    assert service.email_log_token("user@example.com") == service.email_log_token("  User@Example.COM ")
    assert service.email_log_token("user@example.com") != service.email_log_token("other@example.com")


def test_email_log_token_differs_from_the_rate_limit_bucket_for_one_address() -> None:
    """Namespacing stops a log line being correlated against a limiter bucket."""
    assert service.email_log_token("user@example.com").removeprefix("eml_") not in rate_limit_bucket_key(
        "auth:email", "user@example.com"
    )


async def test_a_hanging_provider_gives_up_inside_the_send_window(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """A send that outlasts its window must end with a log line, not with the container.

    Neither the attempt count nor the provider timeouts bound the total wait on their
    own, and a queued send still in flight when the API stops is killed with it: the
    "queued" line would then be the last thing written about a security notification.
    """

    async def hang(_message: EmailMessage) -> None:
        await anyio.sleep(30)

    monkeypatch.setattr(service, "_SEND_WINDOW_SECONDS", 0.05)
    provider = AsyncMock()
    provider.send.side_effect = hang

    with caplog.at_level(logging.ERROR):
        await service._send_and_log(provider, _message(), "Password-reset confirmation", "eml_abc123")

    assert "gave up" in caplog.text


def test_the_send_window_fits_inside_the_container_stop_grace_period() -> None:
    """The bound only means anything while it stays under the grace period."""
    # Mirrors `stop_grace_period` on the api service in compose.yaml; a send that
    # outlasts it is SIGKILLed rather than logged.
    api_stop_grace_seconds = 60
    assert api_stop_grace_seconds > service._SEND_WINDOW_SECONDS


async def test_send_failure_logs_no_recipient_address(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """A refused recipient must not reach the logs through the exception it raises.

    aiosmtplib puts the address in the exception's ``args``, so ``exc_info`` would have
    printed it in the JSON logs that production emits. Formatting each record the way the
    production formatter does is the only assertion that catches that: the message alone
    never contained the address.
    """
    monkeypatch.setattr(service, "_SEND_BACKOFF_SECONDS", 0)
    refused = SMTPRecipientsRefused([SMTPRecipientRefused(550, "No such mailbox", "victim@example.org")])
    provider = AsyncMock()
    provider.send.side_effect = refused

    with caplog.at_level(logging.WARNING):
        await service._send_and_log(provider, _message(), "Email", "eml_deadbeef")

    formatter = build_json_formatter()
    emitted = "\n".join(formatter.format(record) for record in caplog.records)

    assert "victim@example.org" not in emitted
    assert "example.org" not in emitted
    assert "eml_deadbeef" in emitted
    assert "SMTPRecipientsRefused" in emitted
