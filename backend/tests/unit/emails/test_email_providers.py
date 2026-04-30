"""Tests for email provider adapters."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import cast
from unittest.mock import AsyncMock

import pytest
from pydantic import NameEmail, SecretStr

from app.api.auth.config import GraphEmailSettings, ResolvedEmailSettings
from app.api.auth.services.email.messages import EmailMessage
from app.api.auth.services.email.providers import (
    EmailDeliveryError,
    MicrosoftGraphEmailProvider,
    SmtpEmailProvider,
)


def _message() -> EmailMessage:
    return EmailMessage(
        subject="Welcome",
        recipients=[NameEmail(name="Ada", email="ada@example.com")],
        sender=NameEmail(name="RELab", email="relab@example.com"),
        reply_to=[NameEmail(name="Support", email="support@example.com")],
        html_body="<p>Hello Ada</p>",
    )


async def test_smtp_provider_sends_rendered_html_message() -> None:
    """SMTP sends the rendered HTML body without provider-owned template rendering."""
    client = AsyncMock()
    provider = SmtpEmailProvider(client=client)

    await provider.send(_message())

    client.send_message.assert_awaited_once()
    sent_message = client.send_message.await_args.args[0]
    assert sent_message.subject == "Welcome"
    assert sent_message.body == "<p>Hello Ada</p>"
    assert sent_message.recipients[0].email == "ada@example.com"
    assert sent_message.reply_to[0].email == "support@example.com"


class FakeResponse:
    """Small httpx.Response stand-in for provider unit tests."""

    def __init__(self, status_code: int, payload: dict[str, object] | None = None) -> None:
        self.status_code = status_code
        self._payload = payload or {}
        self.text = str(self._payload)

    def json(self) -> dict[str, object]:
        """Return the configured JSON payload."""
        return self._payload

    def raise_for_status(self) -> None:
        """Raise for unsuccessful fake HTTP responses."""
        if self.status_code >= 400:
            msg = f"HTTP {self.status_code}"
            raise RuntimeError(msg)


class FakeGraphClient:
    """Capture Graph HTTP calls."""

    def __init__(self, *, token_status: int = 200, send_status: int = 202) -> None:
        self.token_status = token_status
        self.send_status = send_status
        self.posts: list[dict[str, object]] = []

    async def post(self, url: str, **kwargs: object) -> FakeResponse:
        """Record one fake HTTP post and return a token or send response."""
        self.posts.append({"url": url, **kwargs})
        if "login.microsoftonline.com" in url:
            return FakeResponse(
                self.token_status,
                {"access_token": "token-123", "expires_in": 3600},
            )
        return FakeResponse(self.send_status)


def _graph_settings() -> GraphEmailSettings:
    return GraphEmailSettings(
        tenant_id="tenant-id",
        client_id="client-id",
        client_secret=SecretStr("client-secret"),
        sender_user="relab@example.com",
        save_to_sent_items=False,
    )


async def test_graph_provider_requests_token_and_posts_send_mail_payload() -> None:
    """Graph provider should use client credentials and send the expected JSON payload."""
    client = FakeGraphClient()
    provider = MicrosoftGraphEmailProvider(settings=_graph_settings(), client=client)

    await provider.send(_message())

    token_call, send_call = client.posts
    token_data = cast("dict[str, object]", token_call["data"])
    send_headers = cast("dict[str, object]", send_call["headers"])
    send_json = cast("dict[str, object]", send_call["json"])
    assert token_data.get("client_id") == "client-id"
    assert token_data.get("client_secret") == "client-secret"
    assert token_data.get("scope") == "https://graph.microsoft.com/.default"
    assert send_call["url"] == "https://graph.microsoft.com/v1.0/users/relab%40example.com/sendMail"
    assert send_headers.get("Authorization") == "Bearer token-123"
    assert send_json == {
        "message": {
            "subject": "Welcome",
            "body": {"contentType": "HTML", "content": "<p>Hello Ada</p>"},
            "toRecipients": [{"emailAddress": {"address": "ada@example.com", "name": "Ada"}}],
            "replyTo": [{"emailAddress": {"address": "support@example.com", "name": "Support"}}],
            "from": {"emailAddress": {"address": "relab@example.com", "name": "RELab"}},
        },
        "saveToSentItems": False,
    }


async def test_graph_provider_reuses_cached_token() -> None:
    """A valid cached token avoids repeated token requests."""
    client = FakeGraphClient()
    provider = MicrosoftGraphEmailProvider(settings=_graph_settings(), client=client)

    await provider.send(_message())
    await provider.send(_message())

    token_calls = [call for call in client.posts if "login.microsoftonline.com" in str(call["url"])]
    send_calls = [call for call in client.posts if "graph.microsoft.com/v1.0" in str(call["url"])]
    assert len(token_calls) == 1
    assert len(send_calls) == 2


async def test_graph_provider_refreshes_nearly_expired_cached_token() -> None:
    """Nearly expired cached tokens should not be reused."""
    client = FakeGraphClient()
    provider = MicrosoftGraphEmailProvider(settings=_graph_settings(), client=client)
    provider._token = "old-token"  # noqa: SLF001 - explicit cache-state test
    provider._token_expires_at = datetime.now(UTC) + timedelta(seconds=10)  # noqa: SLF001

    await provider.send(_message())

    token_calls = [call for call in client.posts if "login.microsoftonline.com" in str(call["url"])]
    assert len(token_calls) == 1


async def test_graph_provider_raises_delivery_error_on_token_failure() -> None:
    """Token failures should surface as controlled delivery errors."""
    provider = MicrosoftGraphEmailProvider(settings=_graph_settings(), client=FakeGraphClient(token_status=401))

    with pytest.raises(EmailDeliveryError, match="token"):
        await provider.send(_message())


async def test_graph_provider_raises_delivery_error_on_send_failure() -> None:
    """Send failures should surface as controlled delivery errors."""
    provider = MicrosoftGraphEmailProvider(settings=_graph_settings(), client=FakeGraphClient(send_status=500))

    with pytest.raises(EmailDeliveryError, match="send"):
        await provider.send(_message())


def test_smtp_provider_builds_from_resolved_email_settings() -> None:
    """SMTP provider construction should preserve existing SMTP config semantics."""
    settings = ResolvedEmailSettings(
        username="smtp-user",
        password=SecretStr("smtp-password"),
        host="smtp.example.com",
        port=587,
        sender=NameEmail(name="RELab", email="relab@example.com"),
        reply_to=NameEmail(name="Support", email="support@example.com"),
    )

    provider = SmtpEmailProvider.from_settings(settings, suppress_send=True)

    assert provider.config is not None
    assert provider.config.MAIL_USERNAME == "smtp-user"
    assert provider.config.MAIL_SERVER == "smtp.example.com"
    assert provider.config.MAIL_FROM == "relab@example.com"
    assert provider.config.MAIL_FROM_NAME == "RELab"
