"""Behavior-focused tests for newsletter admin endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.api.newsletter.models import NewsletterSubscriber
from tests.integration.api._newsletter_support import HTTP_OK

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession


async def test_admin_get_subscribers_returns_list(api_client_superuser: AsyncClient, db_session: AsyncSession) -> None:
    """Test that the admin endpoint for getting newsletter subscribers returns a list of subscribers."""
    emails = ["sub1@example.com", "sub2@example.com"]
    for email in emails:
        db_session.add(NewsletterSubscriber(email=email, is_confirmed=True))
    await db_session.flush()

    response = await api_client_superuser.get("/admin/newsletter/subscribers")

    assert response.status_code == HTTP_OK
    returned_emails = {subscriber["email"] for subscriber in response.json()["items"]}
    for email in emails:
        assert email in returned_emails
