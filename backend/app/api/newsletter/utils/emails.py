"""Email sending utilities for the newsletter service."""

from fastapi import BackgroundTasks
from pydantic import EmailStr

from app.api.auth.utils.programmatic_emails import generate_token_link, send_email_with_template
from app.api.newsletter.utils.tokens import JWTType, create_jwt_token
from app.core.config import settings as core_settings


async def send_newsletter_subscription_email(
    to_email: EmailStr,
    token: str,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """Send a newsletter subscription email."""
    subject = "Reverse Engineering Lab: Confirm Your Newsletter Subscription"
    confirmation_link = generate_token_link(token, "newsletter/confirm", base_url=core_settings.frontend_web_url)

    await send_email_with_template(
        to_email=to_email,
        subject=subject,
        template_name="newsletter_subscription.html",
        template_body={
            "confirmation_link": confirmation_link,
        },
        background_tasks=background_tasks,
    )


async def send_newsletter(
    to_email: EmailStr,
    subject: str,
    content: str,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """Send newsletter with proper unsubscribe link."""
    # Create unsubscribe token and link
    token = create_jwt_token(to_email, JWTType.NEWSLETTER_UNSUBSCRIBE)
    unsubscribe_link = generate_token_link(token, "newsletter/unsubscribe", base_url=core_settings.frontend_web_url)

    await send_email_with_template(
        to_email=to_email,
        subject=subject,
        template_name="newsletter.html",
        template_body={
            "subject": subject,
            "content": content,
            "unsubscribe_link": unsubscribe_link,
        },
        background_tasks=background_tasks,
    )


async def send_newsletter_unsubscription_request_email(
    to_email: EmailStr,
    token: str,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """Send an email with unsubscribe link."""
    subject = "Reverse Engineering Lab: Unsubscribe Request"
    unsubscribe_link = generate_token_link(token, "newsletter/unsubscribe", base_url=core_settings.frontend_web_url)

    await send_email_with_template(
        to_email=to_email,
        subject=subject,
        template_name="newsletter_unsubscribe.html",
        template_body={
            "unsubscribe_link": unsubscribe_link,
        },
        background_tasks=background_tasks,
    )
