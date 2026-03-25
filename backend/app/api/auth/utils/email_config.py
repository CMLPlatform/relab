"""Email configuration for fastapi-mail.

This module provides the FastMail instance and configuration for sending emails
throughout the application.
"""

from pathlib import Path

from fastapi_mail import ConnectionConfig, FastMail

from app.api.auth.config import settings as auth_settings
from app.core.config import settings as core_settings

# Path to pre-compiled HTML email templates
TEMPLATE_FOLDER = Path(__file__).parent.parent.parent.parent / "templates" / "emails" / "build"

# Configure email connection
email_settings = auth_settings.email
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

# Create FastMail instance
fm = FastMail(email_conf)
