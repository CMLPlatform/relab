"""Transactional email service helpers."""

import logging
from functools import lru_cache
from html import escape
from typing import TYPE_CHECKING
from urllib.parse import urlencode, urljoin

from pydantic import AnyUrl, EmailStr

from app.api.auth.config import settings as auth_settings
from app.api.auth.services.email.providers import EmailMessage, EmailProvider, build_email_provider
from app.api.auth.services.email.templates import (
    ACCOUNT_RECOVERY_TEMPLATE,
    OAUTH_WELCOME_TEMPLATE,
    POST_VERIFICATION_TEMPLATE,
    REGISTRATION_TEMPLATE,
    VERIFICATION_TEMPLATE,
    EmailTemplateBody,
    EmailTemplateName,
    render_email_template,
)
from app.core.config import settings as core_settings

if TYPE_CHECKING:
    from fastapi import BackgroundTasks

logger: logging.Logger = logging.getLogger(__name__)
email_settings = auth_settings.email


@lru_cache(maxsize=1)
def get_default_email_provider() -> EmailProvider:
    """Build the configured email provider on first use.

    Deferred so that importing the app in non-serving contexts (migrations,
    seeding, CLIs) does not require valid email config it never uses — building
    the provider validates the sender address.
    """
    return build_email_provider(settings=auth_settings)


def generate_token_link(token: str, route: str, base_url: str | AnyUrl | None = None) -> str:
    """Generate a link with the specified token and route."""
    if base_url is None:
        base_url = str(core_settings.app_public_url)
    return f"{urljoin(str(base_url), route)}#{urlencode({'token': token})}"


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
    recipient = mask_email_for_log(to_email)
    if background_tasks:
        background_tasks.add_task(provider.send, message)
        logger.info("%s queued for %s", log_label, recipient)  # codeql[py/clear-text-logging-sensitive-data]
    else:
        await provider.send(message)
        logger.info("%s sent to %s", log_label, recipient)  # codeql[py/clear-text-logging-sensitive-data]


async def _notify(
    to_email: EmailStr,
    subject: str,
    html_body: str,
    log_label: str,
    background_tasks: BackgroundTasks | None = None,
    provider: EmailProvider | None = None,
) -> None:
    """Build and dispatch a plain (non-templated) security-notification email."""
    await _dispatch(
        _build_message(to_email, subject, html_body),
        to_email,
        log_label,
        background_tasks,
        provider or get_default_email_provider(),
    )


async def send_templated_email(
    to_email: EmailStr,
    subject: str,
    template_name: EmailTemplateName,
    template_body: EmailTemplateBody,
    background_tasks: BackgroundTasks | None = None,
    provider: EmailProvider | None = None,
) -> None:
    """Send one validated templated email through the configured provider."""
    selected_provider = provider or get_default_email_provider()
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
        subject="Welcome to Relab — Verify Your Email",
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


async def send_mfa_changed_notification(
    to_email: EmailStr,
    username: str | None,
    *,
    enabled: bool,
    background_tasks: BackgroundTasks | None = None,
    provider: EmailProvider | None = None,
) -> None:
    """Notify a user out-of-band whenever their two-step verification changes."""
    display_name = escape(_display_name(username, to_email))
    change = "turned on" if enabled else "turned off"
    if enabled:
        followup = "If you did not turn this on, reset your password and contact Relab support."
    else:
        followup = "If you did not turn this off, reset your password and contact Relab support immediately."
    await _notify(
        to_email,
        f"Two-step verification was {change}",
        f"<p>Hello {display_name},</p><p>Two-step verification was {change} on your Relab account. {followup}</p>",
        "MFA-change notification",
        background_tasks,
        provider,
    )


async def send_recovery_codes_regenerated_notification(
    to_email: EmailStr,
    username: str | None,
    *,
    background_tasks: BackgroundTasks | None = None,
    provider: EmailProvider | None = None,
) -> None:
    """Notify a user out-of-band when their two-step recovery codes are regenerated."""
    display_name = escape(_display_name(username, to_email))
    await _notify(
        to_email,
        "Your two-step recovery codes changed",
        (
            f"<p>Hello {display_name},</p>"
            "<p>New two-step recovery codes were generated for your Relab account, and any "
            "previous codes no longer work. If you did not do this, reset your password and "
            "contact Relab support immediately.</p>"
        ),
        "MFA recovery-codes notification",
        background_tasks,
        provider,
    )


async def send_oauth_link_changed_notification(
    to_email: EmailStr,
    username: str | None,
    *,
    oauth_provider: str,
    linked: bool,
    background_tasks: BackgroundTasks | None = None,
    provider: EmailProvider | None = None,
) -> None:
    """Notify a user out-of-band whenever a social login is linked or unlinked."""
    display_name = escape(_display_name(username, to_email))
    provider_label = escape(oauth_provider.capitalize())
    change = "linked to" if linked else "unlinked from"
    await _notify(
        to_email,
        f"A social login was {'linked' if linked else 'unlinked'}",
        (
            f"<p>Hello {display_name},</p>"
            f"<p>{provider_label} was {change} your Relab account. "
            "If you did not make this change, reset your password and contact Relab support immediately.</p>"
        ),
        "OAuth link-change notification",
        background_tasks,
        provider,
    )


async def send_existing_account_notification(
    to_email: EmailStr,
    background_tasks: BackgroundTasks | None = None,
    provider: EmailProvider | None = None,
) -> None:
    """Tell an address a signup was attempted for an account that already exists.

    Lets registration return the same response whether or not the email is taken
    (no account enumeration) while still telling the real owner what happened.
    """
    await _notify(
        to_email,
        "You already have a Relab account",
        (
            "<p>Someone tried to create a Relab account with this email address, but you already "
            "have one. If this was you, just log in — or reset your password if you have forgotten it. "
            "If it was not you, you can safely ignore this email.</p>"
        ),
        "Existing-account notification",
        background_tasks,
        provider,
    )


async def send_oauth_welcome_notification(
    to_email: EmailStr,
    username: str | None,
    *,
    oauth_provider: str,
    background_tasks: BackgroundTasks | None = None,
    provider: EmailProvider | None = None,
) -> None:
    """Welcome a user who just created their account through a social login."""
    await send_templated_email(
        to_email=to_email,
        subject="Welcome to Relab",
        template_name=OAUTH_WELCOME_TEMPLATE,
        template_body={
            "username": _display_name(username, to_email),
            "provider_label": oauth_provider.capitalize(),
        },
        background_tasks=background_tasks,
        provider=provider,
    )


async def send_password_reset_confirmation_email(
    to_email: EmailStr,
    username: str | None,
    background_tasks: BackgroundTasks | None = None,
    provider: EmailProvider | None = None,
) -> None:
    """Notify a user after their account password has been reset."""
    display_name = escape(_display_name(username, to_email))
    await _notify(
        to_email,
        "Your Relab password was reset",
        (
            f"<p>Hello {display_name},</p>"
            "<p>Your Relab account password was reset. "
            "If you did not make this change, contact Relab support immediately.</p>"
        ),
        "Password-reset confirmation",
        background_tasks,
        provider,
    )


async def send_password_changed_notification(
    to_email: EmailStr,
    username: str | None,
    background_tasks: BackgroundTasks | None = None,
    provider: EmailProvider | None = None,
) -> None:
    """Notify a user after their account password has been changed while signed in."""
    display_name = escape(_display_name(username, to_email))
    await _notify(
        to_email,
        "Your Relab password was changed",
        (
            f"<p>Hello {display_name},</p>"
            "<p>Your Relab account password was changed. "
            "If you did not make this change, reset your password and contact Relab support.</p>"
        ),
        "Password-change notification",
        background_tasks,
        provider,
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


async def send_email_changed_notification(
    to_email: EmailStr,
    background_tasks: BackgroundTasks | None = None,
    provider: EmailProvider | None = None,
) -> None:
    """Notify the previous address after an account email change."""
    await _notify(
        to_email,
        "Your Relab account email changed",
        (
            "<p>Your Relab account email address was changed. "
            "If you did not make this change, contact Relab support.</p>"
        ),
        "Email-change notification",
        background_tasks,
        provider,
    )
