"""Email delivery provider adapters."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Protocol
from urllib.parse import quote

import httpx
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType

from app.api.auth.config import AuthSettings, EmailProviderName, GraphEmailSettings, ResolvedEmailSettings
from app.api.auth.services.email.messages import EmailMessage
from app.core.config import settings as core_settings

if TYPE_CHECKING:
    from pydantic import NameEmail

MICROSOFT_GRAPH_SCOPE = "https://graph.microsoft.com/.default"
MICROSOFT_GRAPH_TOKEN_REFRESH_MARGIN_SECONDS = 60
MICROSOFT_GRAPH_TOKEN_URL_TEMPLATE = "https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"  # noqa: S105
MICROSOFT_GRAPH_SEND_MAIL_URL_TEMPLATE = "https://graph.microsoft.com/v1.0/users/{sender}/sendMail"


class EmailDeliveryError(RuntimeError):
    """Raised when an email provider cannot deliver a message."""


class EmailProvider(Protocol):
    """Application-facing email provider contract."""

    async def send(self, message: EmailMessage) -> None:
        """Deliver one rendered email message."""


class GraphHttpResponse(Protocol):
    """Small subset of httpx.Response used by the Graph provider."""

    text: str

    def json(self) -> dict[str, object]:
        """Return a JSON response body."""
        ...

    def raise_for_status(self) -> None:
        """Raise when the HTTP request failed."""
        ...


class GraphHttpClient(Protocol):
    """Small subset of httpx.AsyncClient used by the Graph provider."""

    async def post(
        self,
        url: str,
        *,
        data: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
        json: object | None = None,
    ) -> GraphHttpResponse:
        """Send one HTTP POST request."""
        ...


def _name_email_payload(value: NameEmail) -> dict[str, dict[str, str]]:
    return {"emailAddress": {"address": value.email, "name": value.name}}


def build_smtp_config(email_settings: ResolvedEmailSettings, *, suppress_send: bool) -> ConnectionConfig:
    """Build FastMail SMTP configuration from resolved settings."""
    return ConnectionConfig(
        MAIL_USERNAME=email_settings.username,
        MAIL_PASSWORD=email_settings.password,
        MAIL_FROM=email_settings.sender.email if email_settings.sender else "",
        MAIL_FROM_NAME=email_settings.sender.name if email_settings.sender else None,
        MAIL_PORT=email_settings.port,
        MAIL_SERVER=email_settings.host,
        MAIL_STARTTLS=True,
        MAIL_SSL_TLS=False,
        SUPPRESS_SEND=suppress_send,
    )


class SmtpEmailProvider:
    """Adapter that sends rendered emails through SMTP/FastMail."""

    def __init__(self, client: FastMail, config: ConnectionConfig | None = None) -> None:
        self._client = client
        self.config = config

    @classmethod
    def from_settings(cls, settings: ResolvedEmailSettings, *, suppress_send: bool) -> SmtpEmailProvider:
        """Build an SMTP provider from auth email settings."""
        config = build_smtp_config(settings, suppress_send=suppress_send)
        return cls(client=FastMail(config), config=config)

    async def send(self, message: EmailMessage) -> None:
        """Send one rendered HTML message through SMTP."""
        smtp_message = MessageSchema(
            subject=message.subject,
            recipients=message.recipients,
            body=message.html_body,
            subtype=MessageType.html,
            reply_to=message.reply_to,
        )
        await self._client.send_message(smtp_message)


class MicrosoftGraphEmailProvider:
    """Adapter that sends rendered emails through Microsoft Graph."""

    def __init__(self, settings: GraphEmailSettings, client: GraphHttpClient | None = None) -> None:
        self._settings = settings
        self._client = client or httpx.AsyncClient(timeout=10)
        self._token: str | None = None
        self._token_expires_at: datetime | None = None

    def _has_valid_token(self) -> bool:
        if self._token is None or self._token_expires_at is None:
            return False
        margin = timedelta(seconds=MICROSOFT_GRAPH_TOKEN_REFRESH_MARGIN_SECONDS)
        return datetime.now(UTC) + margin < self._token_expires_at

    async def _get_access_token(self) -> str:
        if self._has_valid_token():
            return self._token or ""

        token_url = MICROSOFT_GRAPH_TOKEN_URL_TEMPLATE.format(tenant_id=quote(self._settings.tenant_id, safe=""))
        try:
            response = await self._client.post(
                token_url,
                data={
                    "client_id": self._settings.client_id,
                    "client_secret": self._settings.client_secret.get_secret_value(),
                    "grant_type": "client_credentials",
                    "scope": MICROSOFT_GRAPH_SCOPE,
                },
            )
            response.raise_for_status()
        except Exception as exc:
            msg = "Microsoft Graph token request failed"
            raise EmailDeliveryError(msg) from exc

        payload = response.json()
        token = payload.get("access_token")
        if not isinstance(token, str) or not token:
            msg = "Microsoft Graph token response did not include an access token"
            raise EmailDeliveryError(msg)
        expires_in = payload.get("expires_in", 3600)
        expires_seconds = int(expires_in) if isinstance(expires_in, int | str) else 3600
        self._token = token
        self._token_expires_at = datetime.now(UTC) + timedelta(seconds=expires_seconds)
        return token

    async def send(self, message: EmailMessage) -> None:
        """Send one rendered HTML message through Microsoft Graph."""
        token = await self._get_access_token()
        send_url = MICROSOFT_GRAPH_SEND_MAIL_URL_TEMPLATE.format(sender=quote(self._settings.sender_user, safe=""))
        message_payload: dict[str, object] = {
            "subject": message.subject,
            "body": {"contentType": "HTML", "content": message.html_body},
            "toRecipients": [_name_email_payload(recipient) for recipient in message.recipients],
            "replyTo": [_name_email_payload(reply_to) for reply_to in message.reply_to],
        }
        payload: dict[str, object] = {
            "message": message_payload,
            "saveToSentItems": self._settings.save_to_sent_items,
        }
        if message.sender is not None:
            message_payload["from"] = _name_email_payload(message.sender)

        try:
            response = await self._client.post(
                send_url,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json=payload,
            )
            response.raise_for_status()
        except Exception as exc:
            msg = "Microsoft Graph sendMail request failed"
            raise EmailDeliveryError(msg) from exc


def build_email_provider(
    *,
    settings: AuthSettings,
    http_client: GraphHttpClient | None = None,
    suppress_send: bool | None = None,
) -> EmailProvider:
    """Build the configured email provider."""
    if settings.email_provider is EmailProviderName.MICROSOFT_GRAPH:
        return MicrosoftGraphEmailProvider(settings=settings.microsoft_graph_email, client=http_client)
    return SmtpEmailProvider.from_settings(
        settings.email,
        suppress_send=core_settings.mock_emails if suppress_send is None else suppress_send,
    )
