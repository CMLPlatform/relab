"""Email sending utilities for the newsletter service."""

from app.api.auth.utils.programmatic_emails import TextContentType, generate_token_link, send_email
from app.api.newsletter.utils.tokens import JWTType, create_jwt_token


async def send_newsletter_subscription_email(to_email: str, token: str) -> None:
    """Send a newsletter subscription email."""
    subject = "Reverse Engineering Lab: Confirm Your Newsletter Subscription"
    # TODO: Dynamically generate the confirmation link based on the frontend URL tree
    # Alternatively, send the frontend-side link to the backend as a parameter
    confirmation_link = generate_token_link(token, "newsletter/confirm")

    body = f"""
Hello,

Thank you for subscribing to the Reverse Engineering Lab newsletter!

Please confirm your subscription by clicking [here]({confirmation_link}).

This link will expire in 24 hours.

We'll keep you updated with our progress and let you know when the full application is launched.

Best regards,

The Reverse Engineering Lab Team
    """
    await send_email(to_email, subject, body, content_type=TextContentType.MARKDOWN)


async def send_newsletter(to_email: str, subject: str, content: str) -> None:
    """Send newsletter with proper unsubscribe headers."""
    # Create unsubscribe token and link
    token = create_jwt_token(to_email, JWTType.NEWSLETTER_UNSUBSCRIBE)
    unsubscribe_link = generate_token_link(token, "newsletter/unsubscribe")

    # Add footer with unsubscribe link
    body = f"""
    {content}

---
You're receiving this email because you subscribed to the Reverse Engineering Lab newsletter.
To unsubscribe, click [here]({unsubscribe_link})
    """

    # Add List-Unsubscribe header for email clients that support it
    headers = {"List-Unsubscribe": f"<{unsubscribe_link}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"}

    await send_email(to_email, subject, body, content_type=TextContentType.MARKDOWN, headers=headers)


async def send_newsletter_unsubscription_request_email(to_email: str, token: str) -> None:
    """Send an email with unsubscribe link."""
    subject = "Reverse Engineering Lab: Unsubscribe Request"
    unsubscribe_link = generate_token_link(token, "newsletter/unsubscribe")

    body = f"""
Hello,

We received a request to unsubscribe this email address from the Reverse Engineering Lab newsletter.

If you made this request, please click [here]({unsubscribe_link}) to unsubscribe.

If you did not request to unsubscribe, you can safely ignore this email.

Best regards,

The Reverse Engineering Lab Team
    """
    await send_email(to_email, subject, body, content_type=TextContentType.MARKDOWN)
