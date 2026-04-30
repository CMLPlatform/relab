"""Typed email template rendering."""

from pathlib import Path
from typing import Literal, TypedDict

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

TEMPLATE_FOLDER = Path(__file__).parents[4] / "templates" / "emails" / "build"
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

TEMPLATE_REQUIRED_FIELDS: dict[EmailTemplateName, frozenset[str]] = {
    REGISTRATION_TEMPLATE: frozenset({"username", "verification_link"}),
    ACCOUNT_RECOVERY_TEMPLATE: frozenset({"username", "reset_link"}),
    VERIFICATION_TEMPLATE: frozenset({"username", "verification_link"}),
    POST_VERIFICATION_TEMPLATE: frozenset({"username"}),
}

template_environment = Environment(
    loader=FileSystemLoader(TEMPLATE_FOLDER),
    autoescape=select_autoescape(enabled_extensions=("html",)),
    undefined=StrictUndefined,
)


def validate_template_body(
    template_name: EmailTemplateName,
    template_body: EmailTemplateBody | dict[str, object],
) -> None:
    """Fail fast if a typed template payload is missing required fields."""
    missing_fields = TEMPLATE_REQUIRED_FIELDS[template_name] - template_body.keys()
    if missing_fields:
        missing = ", ".join(sorted(missing_fields))
        err_msg = f"Template '{template_name}' is missing required context fields: {missing}"
        raise ValueError(err_msg)


def render_email_template(
    template_name: EmailTemplateName,
    template_body: EmailTemplateBody | dict[str, object],
) -> str:
    """Render a committed HTML email template."""
    validate_template_body(template_name, template_body)
    template = template_environment.get_template(template_name)
    return template.render(**dict(template_body))
