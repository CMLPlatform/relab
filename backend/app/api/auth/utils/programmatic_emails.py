"""Utilities for sending authentication-related emails."""

import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from enum import Enum
from urllib.parse import urljoin

import markdown
from aiosmtplib import SMTP, SMTPException

from app.api.auth.config import settings as auth_settings
from app.core.config import settings as core_settings

logger: logging.Logger = logging.getLogger(__name__)


### Common email functions ###
# TODO: Move to using MJML or similar templating system for email content.


class TextContentType(str, Enum):
    """Type for specifying the content type of the email body."""

    PLAIN = "plain"
    HTML = "html"
    MARKDOWN = "markdown"

    def body_to_mimetext(self, body: str) -> MIMEText:
        """Convert an email body to MIMEText format."""
        match self:
            case TextContentType.PLAIN:
                return MIMEText(body, "plain")
            case TextContentType.HTML:
                return MIMEText(body, "html")
            case TextContentType.MARKDOWN:
                # Convert Markdown to HTML
                html = markdown.markdown(body)
                return MIMEText(html, "html")


async def send_email(
    to_email: str,
    subject: str,
    body: str,
    content_type: TextContentType = TextContentType.PLAIN,
    headers: dict | None = None,
) -> None:
    """Send an email with the specified subject and body."""
    msg = MIMEMultipart()
    msg["From"] = auth_settings.email_from
    msg["Reply-To"] = auth_settings.email_reply_to
    msg["To"] = to_email
    msg["Subject"] = subject

    # Add additional headers if provided
    if headers:
        for key, value in headers.items():
            msg[key] = value

    # Attach the body in the specified content type
    msg.attach(content_type.body_to_mimetext(body))

    try:
        # TODO: Investigate use of managed outlook address for sending emails
        smtp = SMTP(
            hostname=auth_settings.email_host,
            port=auth_settings.email_port,
        )
        await smtp.connect()
        await smtp.login(auth_settings.email_username, auth_settings.email_password)
        await smtp.send_message(msg)
        await smtp.quit()
        logger.info("Email sent to %s", to_email)
    except SMTPException as e:
        error_message = f"Error sending email: {e}"
        raise SMTPException(error_message) from e


def generate_token_link(token: str, route: str) -> str:
    """Generate a link with the specified token and route."""
    # TODO: Check that the base url works in remote deployment
    return urljoin(str(core_settings.frontend_app_url), f"{route}?token={token}")


### Email content ###
async def send_registration_email(to_email: str, username: str | None, token: str) -> None:
    """Send a registration email with verification token."""
    # TODO: Store frontend paths required by the backend in a shared .env or other config file in the root directory
    # Alternatively, we can send the right path as a parameter from the frontend to the backend
    verification_link = generate_token_link(token, "/verify")
    subject = "Welcome to Reverse Engineering Lab - Verify Your Email"
    body = f"""
Hello {username if username else to_email},

Thank you for registering! Please verify your email by clicking the link below:

{verification_link}

This link will expire in 1 hour.

If you did not register for this service, please ignore this email.

Best regards,

The Reverse Engineering Lab Team
    """

    await send_email(subject=subject, body=body, to_email=to_email)


async def send_reset_password_email(to_email: str, username: str | None, token: str) -> None:
    """Send a reset password email with the token."""
    request_password_link = generate_token_link(token, "/reset-password")
    subject = "Password Reset"
    body = f"""
Hello {username if username else to_email},

Please reset your password by clicking the link below:

{request_password_link}

This link will expire in 1 hour.

If you did not request a password reset, please ignore this email.

Best regards,

The Reverse Engineering Lab Team
    """
    await send_email(to_email, subject, body)


async def send_verification_email(to_email: str, username: str | None, token: str) -> None:
    """Send a verification email with the token."""
    verification_link = generate_token_link(token, "/verify")
    subject = "Email Verification"
    body = f"""
Hello {username if username else to_email},

Please verify your email by clicking the link below:

{verification_link}

This link will expire in 1 hour.

If you did not request verification, please ignore this email.

Best regards,

The Reverse Engineering Lab Team
    """
    await send_email(to_email, subject, body)


async def send_post_verification_email(to_email: str, username: str | None) -> None:
    """Send a post-verification email."""
    subject = "Email Verified"
    body = f"""
Hello {username if username else to_email},

Your email has been verified!

Best regards,

The Reverse Engineering Lab Team
    """
    await send_email(to_email, subject, body)
