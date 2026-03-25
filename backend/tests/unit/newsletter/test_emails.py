"""Unit tests for newsletter email utilities."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.api.newsletter.utils.emails import (
    send_newsletter,
    send_newsletter_subscription_email,
    send_newsletter_unsubscription_request_email,
)

TEST_EMAIL = "user@example.com"
TEST_TOKEN = "test-token-abc123"
TEST_SUBJECT = "Test Newsletter"
TEST_CONTENT = "Hello from the newsletter!"


@pytest.mark.unit
class TestNewsletterEmails:
    """Tests for newsletter email sending utilities."""

    async def test_send_newsletter_subscription_email(self) -> None:
        """Test that subscription email is sent with correct template and subject."""
        with (
            patch("app.api.newsletter.utils.emails.generate_token_link", return_value="http://confirm.link"),
            patch("app.api.newsletter.utils.emails.send_email_with_template") as mock_send,
        ):
            await send_newsletter_subscription_email(TEST_EMAIL, TEST_TOKEN)

            mock_send.assert_called_once()
            call_kwargs = mock_send.call_args.kwargs
            assert call_kwargs["to_email"] == TEST_EMAIL
            assert "Confirm" in call_kwargs["subject"]
            assert call_kwargs["template_name"] == "newsletter_subscription.html"
            assert call_kwargs["template_body"]["confirmation_link"] == "http://confirm.link"

    async def test_send_newsletter_subscription_email_with_background_tasks(self) -> None:
        """Test that background_tasks is passed through to send_email_with_template."""
        background_tasks = AsyncMock()
        with (
            patch("app.api.newsletter.utils.emails.generate_token_link", return_value="http://link"),
            patch("app.api.newsletter.utils.emails.send_email_with_template") as mock_send,
        ):
            await send_newsletter_subscription_email(TEST_EMAIL, TEST_TOKEN, background_tasks=background_tasks)

            call_kwargs = mock_send.call_args.kwargs
            assert call_kwargs["background_tasks"] == background_tasks

    async def test_send_newsletter(self) -> None:
        """Test that newsletter is sent with unsubscribe link in body."""
        with (
            patch("app.api.newsletter.utils.emails.create_jwt_token", return_value=TEST_TOKEN) as mock_jwt,
            patch(
                "app.api.newsletter.utils.emails.generate_token_link", return_value="http://unsubscribe.link"
            ) as mock_link,
            patch("app.api.newsletter.utils.emails.send_email_with_template") as mock_send,
        ):
            await send_newsletter(TEST_EMAIL, TEST_SUBJECT, TEST_CONTENT)

            mock_jwt.assert_called_once()
            mock_link.assert_called_once_with(
                TEST_TOKEN, "newsletter/unsubscribe", base_url=mock_link.call_args.kwargs.get("base_url")
            )
            mock_send.assert_called_once()
            call_kwargs = mock_send.call_args.kwargs
            assert call_kwargs["to_email"] == TEST_EMAIL
            assert call_kwargs["subject"] == TEST_SUBJECT
            assert call_kwargs["template_name"] == "newsletter.html"
            assert call_kwargs["template_body"]["content"] == TEST_CONTENT
            assert "unsubscribe_link" in call_kwargs["template_body"]

    async def test_send_newsletter_unsubscription_request_email(self) -> None:
        """Test that unsubscription request email is sent with correct template."""
        with (
            patch("app.api.newsletter.utils.emails.generate_token_link", return_value="http://unsub.link") as mock_link,
            patch("app.api.newsletter.utils.emails.send_email_with_template") as mock_send,
        ):
            await send_newsletter_unsubscription_request_email(TEST_EMAIL, TEST_TOKEN)

            mock_link.assert_called_once_with(
                TEST_TOKEN, "newsletter/unsubscribe", base_url=mock_link.call_args.kwargs.get("base_url")
            )
            mock_send.assert_called_once()
            call_kwargs = mock_send.call_args.kwargs
            assert call_kwargs["to_email"] == TEST_EMAIL
            assert "Unsubscribe" in call_kwargs["subject"]
            assert call_kwargs["template_name"] == "newsletter_unsubscribe.html"
            assert "unsubscribe_link" in call_kwargs["template_body"]
