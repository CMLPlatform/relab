"""Email delivery helpers for authentication and newsletter flows."""

import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any
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


async def send_email_with_template(
    to_email: EmailStr,
    subject: str,
    template_name: str,
    template_body: dict[str, Any],
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """Send an HTML email using a template."""
    message = MessageSchema(
        subject=subject,
        recipients=[email_settings.recipient(to_email)],
        template_body=template_body,
        subtype=MessageType.html,
        reply_to=[email_settings.reply_to] if email_settings.reply_to else [],
    )

    if background_tasks:
        background_tasks.add_task(fm.send_message, message, template_name=template_name)
        logger.info(
            "Email queued for background sending to %s using template %s", mask_email_for_log(to_email), template_name
        )
    else:
        await fm.send_message(message, template_name=template_name)
        logger.info("Email sent to %s using template %s", mask_email_for_log(to_email), template_name)


async def send_registration_email(
    to_email: EmailStr,
    username: str | None,
    token: str,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """Send a registration email with verification token."""
    verification_link = generate_token_link(token, "/verify")
    await send_email_with_template(
        to_email=to_email,
        subject="Welcome to Reverse Engineering Lab - Verify Your Email",
        template_name="registration.html",
        template_body={"username": username or to_email, "verification_link": verification_link},
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
    await send_email_with_template(
        to_email=to_email,
        subject="Password Reset",
        template_name="password_reset.html",
        template_body={"username": username or to_email, "reset_link": reset_link},
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
    await send_email_with_template(
        to_email=to_email,
        subject="Email Verification",
        template_name="verification.html",
        template_body={"username": username or to_email, "verification_link": verification_link},
        background_tasks=background_tasks,
    )


async def send_post_verification_email(
    to_email: EmailStr,
    username: str | None,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """Send a post-verification email."""
    await send_email_with_template(
        to_email=to_email,
        subject="Email Verified",
        template_name="post_verification.html",
        template_body={"username": username or to_email},
        background_tasks=background_tasks,
    )
