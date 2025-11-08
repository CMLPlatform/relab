"""Email configuration for fastapi-mail.

This module provides the FastMail instance and configuration for sending emails
throughout the application.
"""

from pathlib import Path

from fastapi_mail import ConnectionConfig, FastMail

from app.api.auth.config import settings as auth_settings

# Path to pre-compiled HTML email templates
TEMPLATE_FOLDER = Path(__file__).parent.parent.parent.parent / "templates" / "emails" / "build"

# Configure email connection
email_conf = ConnectionConfig(
    MAIL_USERNAME=auth_settings.email_username,
    MAIL_PASSWORD=auth_settings.email_password,
    MAIL_FROM=auth_settings.email_from,
    MAIL_PORT=auth_settings.email_port,
    MAIL_SERVER=auth_settings.email_host,
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False,
    USE_CREDENTIALS=True,
    VALIDATE_CERTS=True,
    TEMPLATE_FOLDER=TEMPLATE_FOLDER,
)

# Create FastMail instance
fm = FastMail(email_conf)
