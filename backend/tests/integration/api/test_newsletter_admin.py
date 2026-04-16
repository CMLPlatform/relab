"""Behavior-focused tests for newsletter admin endpoints."""
# ruff: noqa: D103

from __future__ import annotations

import pytest

from app.api.newsletter.models import NewsletterSubscriber
from tests.integration.api._newsletter_support import HTTP_OK

if False:  # pragma: no cover
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_admin_get_subscribers_returns_list(
    api_client_superuser: AsyncClient, db_session: AsyncSession
) -> None:
    emails = ["sub1@example.com", "sub2@example.com"]
    for email in emails:
        db_session.add(NewsletterSubscriber(email=email, is_confirmed=True))
    await db_session.flush()

    response = await api_client_superuser.get("/admin/newsletter/subscribers")

    assert response.status_code == HTTP_OK
    returned_emails = {subscriber["email"] for subscriber in response.json()["items"]}
    for email in emails:
        assert email in returned_emails
