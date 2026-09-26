"""Tests for email provider adapters."""

import json
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock
from urllib.parse import parse_qs

import pytest
from httpx import AsyncClient, MockTransport, Request, Response
from pydantic import NameEmail, SecretStr

from app.api.auth.config import GraphEmailSettings, ResolvedEmailSettings
from app.api.auth.services.email import providers as providers_module
from app.api.auth.services.email.providers import (
    EmailDeliveryError,
    EmailMessage,
    MicrosoftGraphEmailProvider,
    SmtpEmailProvider,
)


def _message() -> EmailMessage:
    return EmailMessage(
        subject="Welcome",
        recipients=[NameEmail(name="Ada", email="ada@example.com")],
        sender=NameEmail(name="Relab", email="relab@example.com"),
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


TOKEN_HOST = "login.microsoftonline.com"


def _graph_client(*, token_status: int = 200, send_status: int = 202) -> tuple[AsyncClient, list[Request]]:
    """Return an HTTP client that answers Graph token and send calls, and the requests it saw."""
    requests: list[Request] = []

    def handler(request: Request) -> Response:
        requests.append(request)
        if request.url.host == TOKEN_HOST:
            return Response(token_status, json={"access_token": "token-123", "expires_in": 3600})
        return Response(send_status)

    return AsyncClient(transport=MockTransport(handler)), requests


def _token_requests(requests: list[Request]) -> list[Request]:
    return [r for r in requests if r.url.host == TOKEN_HOST]


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
    client, requests = _graph_client()
    provider = MicrosoftGraphEmailProvider(settings=_graph_settings(), client=client)

    await provider.send(_message())

    token_call, send_call = requests
    token_data = parse_qs(token_call.content.decode())
    assert token_data["client_id"] == ["client-id"]
    assert token_data["client_secret"] == ["client-secret"]
    assert token_data["scope"] == ["https://graph.microsoft.com/.default"]
    assert str(send_call.url) == "https://graph.microsoft.com/v1.0/users/relab%40example.com/sendMail"
    assert send_call.headers["Authorization"] == "Bearer token-123"
    assert json.loads(send_call.content) == {
        "message": {
            "subject": "Welcome",
            "body": {"contentType": "HTML", "content": "<p>Hello Ada</p>"},
            "toRecipients": [{"emailAddress": {"address": "ada@example.com", "name": "Ada"}}],
            "replyTo": [{"emailAddress": {"address": "support@example.com", "name": "Support"}}],
            "from": {"emailAddress": {"address": "relab@example.com", "name": "Relab"}},
        },
        "saveToSentItems": False,
    }


async def test_graph_provider_reuses_cached_token() -> None:
    """A valid cached token avoids repeated token requests."""
    client, requests = _graph_client()
    provider = MicrosoftGraphEmailProvider(settings=_graph_settings(), client=client)

    await provider.send(_message())
    await provider.send(_message())

    assert len(_token_requests(requests)) == 1
    assert len(requests) == 3


async def test_graph_provider_refreshes_nearly_expired_cached_token() -> None:
    """Nearly expired cached tokens should not be reused."""
    client, requests = _graph_client()
    provider = MicrosoftGraphEmailProvider(settings=_graph_settings(), client=client)
    provider._token = "old-token"
    provider._token_expires_at = datetime.now(UTC) + timedelta(seconds=10)

    await provider.send(_message())

    assert len(_token_requests(requests)) == 1


async def test_graph_provider_raises_delivery_error_on_token_failure() -> None:
    """Token failures should surface as controlled delivery errors."""
    provider = MicrosoftGraphEmailProvider(settings=_graph_settings(), client=_graph_client(token_status=401)[0])

    with pytest.raises(EmailDeliveryError, match="token"):
        await provider.send(_message())


async def test_graph_provider_raises_delivery_error_on_send_failure() -> None:
    """Send failures should surface as controlled delivery errors."""
    provider = MicrosoftGraphEmailProvider(settings=_graph_settings(), client=_graph_client(send_status=500)[0])

    with pytest.raises(EmailDeliveryError, match="send"):
        await provider.send(_message())


async def test_graph_provider_default_client_uses_shared_http_policy(monkeypatch: pytest.MonkeyPatch) -> None:
    """Graph email calls should create and close an owned shared HTTP client."""
    client, requests = _graph_client()
    monkeypatch.setattr(providers_module, "create_http_client", lambda: client)

    provider = MicrosoftGraphEmailProvider(settings=_graph_settings())

    await provider.send(_message())

    assert client.is_closed
    assert len(requests) == 2


def test_smtp_provider_builds_from_resolved_email_settings() -> None:
    """SMTP provider construction should preserve existing SMTP config semantics."""
    settings = ResolvedEmailSettings(
        username="smtp-user",
        password=SecretStr("smtp-password"),
        host="smtp.example.com",
        port=587,
        timeout_seconds=15,
        sender=NameEmail(name="Relab", email="relab@example.com"),
        reply_to=NameEmail(name="Support", email="support@example.com"),
    )

    provider = SmtpEmailProvider.from_settings(settings, suppress_send=True)

    assert provider.config is not None
    # fastapi-mail would otherwise default this to 60s, which a deferred send still
    # spends holding a worker task.
    assert provider.config.TIMEOUT == 15
    assert provider.config.MAIL_USERNAME == "smtp-user"
    assert provider.config.MAIL_SERVER == "smtp.example.com"
    assert provider.config.MAIL_FROM == "relab@example.com"
    assert provider.config.MAIL_FROM_NAME == "Relab"
