"""Shared email delivery helpers for transactional and future product emails."""

import logging
from pathlib import Path
from typing import TYPE_CHECKING, Literal, Protocol, TypedDict
from urllib.parse import urljoin

from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
from pydantic import AnyUrl, EmailStr

from app.api.auth.config import settings as auth_settings
from app.core.config import settings as core_settings

if TYPE_CHECKING:
    from fastapi import BackgroundTasks

logger: logging.Logger = logging.getLogger(__name__)
email_settings = auth_settings.email

TEMPLATE_FOLDER = Path(__file__).parent.parent.parent.parent / "templates" / "emails" / "build"
REGISTRATION_TEMPLATE = "registration.html"
ACCOUNT_RECOVERY_TEMPLATE = "password_reset.html"
VERIFICATION_TEMPLATE = "verification.html"
POST_VERIFICATION_TEMPLATE = "post_verification.html"


type EmailTemplateName = Literal[
    "registration.html",
    "password_reset.html",
    "verification.html",
    "post_verification.html",
]


class RegistrationTemplateBody(TypedDict):
    """Template context for account registration emails."""

    username: str
    verification_link: str


class PasswordResetTemplateBody(TypedDict):
    """Template context for reset-password emails."""

    username: str
    reset_link: str


class VerificationTemplateBody(TypedDict):
    """Template context for standalone verification emails."""

    username: str
    verification_link: str


class PostVerificationTemplateBody(TypedDict):
    """Template context for post-verification confirmation emails."""

    username: str


type EmailTemplateBody = (
    RegistrationTemplateBody | PasswordResetTemplateBody | VerificationTemplateBody | PostVerificationTemplateBody
)


class EmailProvider(Protocol):
    """Application-facing email provider contract."""

    async def send(self, message: MessageSchema, *, template_name: EmailTemplateName) -> None:
        """Deliver one templated email message."""


class FastMailEmailProvider:
    """Adapter that sends templated emails through FastMail."""

    def __init__(self, client: FastMail) -> None:
        self._client = client

    async def send(self, message: MessageSchema, *, template_name: EmailTemplateName) -> None:
        """Forward one templated message to FastMail."""
        await self._client.send_message(message, template_name=template_name)


TEMPLATE_REQUIRED_FIELDS: dict[EmailTemplateName, frozenset[str]] = {
    REGISTRATION_TEMPLATE: frozenset({"username", "verification_link"}),
    ACCOUNT_RECOVERY_TEMPLATE: frozenset({"username", "reset_link"}),
    VERIFICATION_TEMPLATE: frozenset({"username", "verification_link"}),
    POST_VERIFICATION_TEMPLATE: frozenset({"username"}),
}

email_conf = ConnectionConfig(
    MAIL_USERNAME=email_settings.username,
    MAIL_PASSWORD=email_settings.password,
    MAIL_FROM=email_settings.sender.email if email_settings.sender else "",
    MAIL_FROM_NAME=email_settings.sender.name if email_settings.sender else None,
    MAIL_PORT=email_settings.port,
    MAIL_SERVER=email_settings.host,
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False,
    TEMPLATE_FOLDER=TEMPLATE_FOLDER,
    SUPPRESS_SEND=core_settings.mock_emails,
)
fm = FastMail(email_conf)
default_email_provider = FastMailEmailProvider(fm)


def generate_token_link(token: str, route: str, base_url: str | AnyUrl | None = None) -> str:
    """Generate a link with the specified token and route."""
    if base_url is None:
        base_url = str(core_settings.frontend_app_url)
    return urljoin(str(base_url), f"{route}?token={token}")


def mask_email_for_log(email: EmailStr, *, mask: bool = True, max_len: int = 80) -> str:
    """Mask emails for logging."""
    string = "".join(ch for ch in str(email) if ch.isprintable()).replace("\n", "").replace("\r", "")
    local, sep, domain = string.partition("@")
    masked = (f"{local[0]}***@{domain}" if len(local) > 1 else f"*@{domain}") if sep and mask else string
    return f"{masked[: max_len - 3]}..." if len(masked) > max_len else masked


def _display_name(username: str | None, to_email: EmailStr) -> str:
    """Return the template display name for account emails."""
    return username or str(to_email)


def validate_template_body(template_name: EmailTemplateName, template_body: EmailTemplateBody) -> None:
    """Fail fast if a typed template payload is missing required fields."""
    missing_fields = TEMPLATE_REQUIRED_FIELDS[template_name] - template_body.keys()
    if missing_fields:
        missing = ", ".join(sorted(missing_fields))
        err_msg = f"Template '{template_name}' is missing required context fields: {missing}"
        raise ValueError(err_msg)


async def send_templated_email(
    to_email: EmailStr,
    subject: str,
    template_name: EmailTemplateName,
    template_body: EmailTemplateBody,
    background_tasks: BackgroundTasks | None = None,
    provider: EmailProvider | None = None,
) -> None:
    """Send one validated templated email through the configured provider."""
    validate_template_body(template_name, template_body)
    message = MessageSchema(
        subject=subject,
        recipients=[email_settings.recipient(to_email)],
        template_body=dict(template_body),
        subtype=MessageType.html,
        reply_to=[email_settings.reply_to] if email_settings.reply_to else [],
    )
    selected_provider = provider or default_email_provider

    if background_tasks:
        background_tasks.add_task(selected_provider.send, message, template_name=template_name)
        logger.info(
            "Email queued for background sending to %s using template %s", mask_email_for_log(to_email), template_name
        )
    else:
        await selected_provider.send(message, template_name=template_name)
        logger.info("Email sent to %s using template %s", mask_email_for_log(to_email), template_name)


async def send_email_with_template(
    to_email: EmailStr,
    subject: str,
    template_name: EmailTemplateName,
    template_body: EmailTemplateBody,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """Backward-compatible wrapper around the shared templated delivery helper."""
    await send_templated_email(
        to_email=to_email,
        subject=subject,
        template_name=template_name,
        template_body=template_body,
        background_tasks=background_tasks,
    )


async def send_registration_email(
    to_email: EmailStr,
    username: str | None,
    token: str,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """Send a registration email with verification token."""
    verification_link = generate_token_link(token, "/verify")
    await send_templated_email(
        to_email=to_email,
        subject="Welcome to Reverse Engineering Lab - Verify Your Email",
        template_name=REGISTRATION_TEMPLATE,
        template_body={"username": _display_name(username, to_email), "verification_link": verification_link},
        background_tasks=background_tasks,
    )


async def send_reset_password_email(
    to_email: EmailStr,
    username: str | None,
    token: str,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """Send a reset password email with the token."""
    reset_link = generate_token_link(token, "/reset-password")
    await send_templated_email(
        to_email=to_email,
        subject="Password Reset",
        template_name=ACCOUNT_RECOVERY_TEMPLATE,
        template_body={"username": _display_name(username, to_email), "reset_link": reset_link},
        background_tasks=background_tasks,
    )


async def send_verification_email(
    to_email: EmailStr,
    username: str | None,
    token: str,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """Send a verification email with the token."""
    verification_link = generate_token_link(token, "/verify")
    await send_templated_email(
        to_email=to_email,
        subject="Email Verification",
        template_name=VERIFICATION_TEMPLATE,
        template_body={"username": _display_name(username, to_email), "verification_link": verification_link},
        background_tasks=background_tasks,
    )


async def send_post_verification_email(
    to_email: EmailStr,
    username: str | None,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """Send a post-verification email."""
    await send_templated_email(
        to_email=to_email,
        subject="Email Verified",
        template_name=POST_VERIFICATION_TEMPLATE,
        template_body={"username": _display_name(username, to_email)},
        background_tasks=background_tasks,
    )
