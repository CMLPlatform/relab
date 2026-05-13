"""Transactional email service helpers."""

import logging
from html import escape
from typing import TYPE_CHECKING
from urllib.parse import urlencode, urljoin

from pydantic import AnyUrl, EmailStr

from app.api.auth.config import settings as auth_settings
from app.api.auth.services.email.messages import EmailMessage
from app.api.auth.services.email.providers import EmailProvider, build_email_provider
from app.api.auth.services.email.templates import (
    ACCOUNT_RECOVERY_TEMPLATE,
    POST_VERIFICATION_TEMPLATE,
    REGISTRATION_TEMPLATE,
    VERIFICATION_TEMPLATE,
    EmailTemplateBody,
    EmailTemplateName,
    render_email_template,
    validate_template_body,
)
from app.core.config import settings as core_settings

if TYPE_CHECKING:
    from fastapi import BackgroundTasks

logger: logging.Logger = logging.getLogger(__name__)
email_settings = auth_settings.email
default_email_provider = build_email_provider(settings=auth_settings)


def generate_token_link(token: str, route: str, base_url: str | AnyUrl | None = None) -> str:
    """Generate a link with the specified token and route."""
    if base_url is None:
        base_url = str(core_settings.frontend_app_url)
    return urljoin(str(base_url), f"{route}?{urlencode({'token': token})}")


def mask_email_for_log(email: EmailStr, *, mask: bool = True, max_len: int = 80) -> str:
    """Mask emails for logging."""
    string = "".join(ch for ch in str(email) if ch.isprintable()).replace("\n", "").replace("\r", "")
    local, sep, domain = string.partition("@")
    masked = (f"{local[0]}***@{domain}" if len(local) > 1 else f"*@{domain}") if sep and mask else string
    return f"{masked[: max_len - 3]}..." if len(masked) > max_len else masked


def _display_name(username: str | None, to_email: EmailStr) -> str:
    """Return the template display name for account emails."""
    return username or str(to_email)


def _build_message(to_email: EmailStr, subject: str, html_body: str) -> EmailMessage:
    """Build an internal rendered email message."""
    return EmailMessage(
        subject=subject,
        recipients=[email_settings.recipient(to_email)],
        sender=email_settings.sender,
        reply_to=[email_settings.reply_to] if email_settings.reply_to else [],
        html_body=html_body,
    )


async def _dispatch(
    message: EmailMessage,
    to_email: EmailStr,
    log_label: str,
    background_tasks: BackgroundTasks | None,
    provider: EmailProvider,
) -> None:
    """Send or enqueue an email message and log the outcome."""
    if background_tasks:
        background_tasks.add_task(provider.send, message)
        logger.info("%s queued for %s", log_label, mask_email_for_log(to_email))
    else:
        await provider.send(message)
        logger.info("%s sent to %s", log_label, mask_email_for_log(to_email))


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
    selected_provider = provider or default_email_provider
    message = _build_message(to_email, subject, render_email_template(template_name, template_body))
    log_label = f"Email (template={template_name}, provider={selected_provider.__class__.__name__})"
    await _dispatch(message, to_email, log_label, background_tasks, selected_provider)


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


async def send_password_reset_confirmation_email(
    to_email: EmailStr,
    username: str | None,
    background_tasks: BackgroundTasks | None = None,
    provider: EmailProvider | None = None,
) -> None:
    """Notify a user after their account password has been reset."""
    display_name = escape(_display_name(username, to_email))
    message = _build_message(
        to_email,
        "Your RELab password was reset",
        (
            f"<p>Hello {display_name},</p>"
            "<p>Your RELab account password was reset. "
            "If you did not make this change, contact RELab support immediately.</p>"
        ),
    )
    await _dispatch(message, to_email, "Password-reset confirmation", background_tasks, provider or default_email_provider)


async def send_password_changed_notification(
    to_email: EmailStr,
    username: str | None,
    background_tasks: BackgroundTasks | None = None,
    provider: EmailProvider | None = None,
) -> None:
    """Notify a user after their account password has been changed while signed in."""
    display_name = escape(_display_name(username, to_email))
    message = _build_message(
        to_email,
        "Your RELab password was changed",
        (
            f"<p>Hello {display_name},</p>"
            "<p>Your RELab account password was changed. "
            "If you did not make this change, reset your password and contact RELab support.</p>"
        ),
    )
    await _dispatch(message, to_email, "Password-change notification", background_tasks, provider or default_email_provider)


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


async def send_email_changed_notification(
    to_email: EmailStr,
    background_tasks: BackgroundTasks | None = None,
    provider: EmailProvider | None = None,
) -> None:
    """Notify the previous address after an account email change."""
    message = _build_message(
        to_email,
        "Your RELab account email changed",
        "<p>Your RELab account email address was changed. If you did not make this change, contact RELab support.</p>",
    )
    await _dispatch(message, to_email, "Email-change notification", background_tasks, provider or default_email_provider)
