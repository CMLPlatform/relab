"""Utilities for sending authentication-related emails using fastapi-mail."""

import logging
from typing import Any
from urllib.parse import urljoin

from fastapi import BackgroundTasks
from fastapi_mail import MessageSchema, MessageType
from pydantic import AnyUrl, EmailStr

from app.api.auth.utils.email_config import fm
from app.core.config import settings as core_settings

logger: logging.Logger = logging.getLogger(__name__)


### Helper functions ###
def generate_token_link(token: str, route: str, base_url: str | AnyUrl | None = None) -> str:
    """Generate a link with the specified token and route."""
    if base_url is None:
        # Default to frontend app URL from core settings
        base_url = str(core_settings.frontend_app_url)
    return urljoin(str(base_url), f"{route}?token={token}")


async def send_email_with_template(
    to_email: EmailStr,
    subject: str,
    template_name: str,
    template_body: dict[str, Any],
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """Send an HTML email using a template.

    Args:
        to_email: Recipient email address
        subject: Email subject line
        template_name: Name of the template file (e.g., "registration.html")
        template_body: Dictionary of variables to pass to the template
        background_tasks: Optional BackgroundTasks instance for async sending
    """
    message = MessageSchema(
        subject=subject,
        recipients=[to_email],
        template_body=template_body,
        subtype=MessageType.html,
    )

    if background_tasks:
        background_tasks.add_task(fm.send_message, message, template_name=template_name)
        logger.info("Email queued for background sending to %s using template %s", to_email, template_name)
    else:
        await fm.send_message(message, template_name=template_name)
        logger.info("Email sent to %s using template %s", to_email, template_name)


### Authentication email functions ###
async def send_registration_email(
    to_email: EmailStr,
    username: str | None,
    token: str,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """Send a registration email with verification token."""
    verification_link = generate_token_link(token, "/verify")
    subject = "Welcome to Reverse Engineering Lab - Verify Your Email"

    await send_email_with_template(
        to_email=to_email,
        subject=subject,
        template_name="registration.html",
        template_body={
            "username": username if username else to_email,
            "verification_link": verification_link,
        },
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
    subject = "Password Reset"

    await send_email_with_template(
        to_email=to_email,
        subject=subject,
        template_name="password_reset.html",
        template_body={
            "username": username if username else to_email,
            "reset_link": reset_link,
        },
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
    subject = "Email Verification"

    await send_email_with_template(
        to_email=to_email,
        subject=subject,
        template_name="verification.html",
        template_body={
            "username": username if username else to_email,
            "verification_link": verification_link,
        },
        background_tasks=background_tasks,
    )


async def send_post_verification_email(
    to_email: EmailStr,
    username: str | None,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """Send a post-verification email."""
    subject = "Email Verified"

    await send_email_with_template(
        to_email=to_email,
        subject=subject,
        template_name="post_verification.html",
        template_body={
            "username": username if username else to_email,
        },
        background_tasks=background_tasks,
    )
