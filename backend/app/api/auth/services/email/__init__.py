"""Transactional email services."""

from .messages import EmailMessage
from .providers import (
    EmailDeliveryError,
    EmailProvider,
    MicrosoftGraphEmailProvider,
    SmtpEmailProvider,
    build_email_provider,
    build_smtp_config,
)
from .service import (
    default_email_provider,
    generate_token_link,
    mask_email_for_log,
    send_post_verification_email,
    send_registration_email,
    send_reset_password_email,
    send_templated_email,
    send_verification_email,
)
from .templates import (
    ACCOUNT_RECOVERY_TEMPLATE,
    POST_VERIFICATION_TEMPLATE,
    REGISTRATION_TEMPLATE,
    TEMPLATE_FOLDER,
    VERIFICATION_TEMPLATE,
    EmailTemplateBody,
    EmailTemplateName,
    render_email_template,
    validate_template_body,
)

__all__ = [
    "ACCOUNT_RECOVERY_TEMPLATE",
    "POST_VERIFICATION_TEMPLATE",
    "REGISTRATION_TEMPLATE",
    "TEMPLATE_FOLDER",
    "VERIFICATION_TEMPLATE",
    "EmailDeliveryError",
    "EmailMessage",
    "EmailProvider",
    "EmailTemplateBody",
    "EmailTemplateName",
    "MicrosoftGraphEmailProvider",
    "SmtpEmailProvider",
    "build_email_provider",
    "build_smtp_config",
    "default_email_provider",
    "generate_token_link",
    "mask_email_for_log",
    "render_email_template",
    "send_post_verification_email",
    "send_registration_email",
    "send_reset_password_email",
    "send_templated_email",
    "send_verification_email",
    "validate_template_body",
]
