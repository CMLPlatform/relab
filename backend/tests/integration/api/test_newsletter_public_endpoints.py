"""Behavior-focused tests for public newsletter endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, patch

import pytest

from app.api.newsletter.models import NewsletterSubscriber
from app.api.newsletter.utils.tokens import JWTType, create_jwt_token
from tests.integration.api._newsletter_support import (
    EMAIL_CONFIRM_REQ,
    EMAIL_CONFIRMED,
    EMAIL_DELETE,
    EMAIL_EXISTING,
    EMAIL_NEW,
    EMAIL_UNSUBSCRIBE,
    HTTP_BAD_REQUEST,
    HTTP_CREATED,
    HTTP_NO_CONTENT,
    HTTP_OK,
    MSG_ALREADY_SUB,
    MSG_NOT_CONFIRMED,
    detail_text,
)

if TYPE_CHECKING:
    from collections.abc import Generator

    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession


@pytest.fixture
def mock_send_subscription_email() -> Generator[AsyncMock]:
    """Mock newsletter subscription emails."""
    with patch("app.api.newsletter.routers.send_newsletter_subscription_email", new_callable=AsyncMock) as mocked:
        yield mocked


@pytest.fixture
def mock_send_unsubscription_email() -> Generator[AsyncMock]:
    """Mock newsletter unsubscription emails."""
    with patch(
        "app.api.newsletter.routers.send_newsletter_unsubscription_request_email", new_callable=AsyncMock
    ) as mocked:
        yield mocked


async def test_subscribe_new_email(api_client: AsyncClient, mock_send_subscription_email: AsyncMock) -> None:
    """Creates an unconfirmed subscriber for a new email address."""
    response = await api_client.post("/newsletter/subscribe", json=EMAIL_NEW)
    assert response.status_code == HTTP_CREATED
    data = response.json()
    assert data["email"] == EMAIL_NEW
    assert data["is_confirmed"] is False
    mock_send_subscription_email.assert_called_once()


async def test_subscribe_existing_unconfirmed_email(
    api_client: AsyncClient,
    db_session: AsyncSession,
    mock_send_subscription_email: AsyncMock,
) -> None:
    """Rejects duplicate subscription requests for an unconfirmed subscriber."""
    subscriber = NewsletterSubscriber(email=EMAIL_EXISTING, is_confirmed=False)
    db_session.add(subscriber)
    await db_session.flush()

    response = await api_client.post("/newsletter/subscribe", json=EMAIL_EXISTING)
    assert response.status_code == HTTP_BAD_REQUEST
    assert MSG_NOT_CONFIRMED in detail_text(response.json())
    mock_send_subscription_email.assert_called_once()


async def test_subscribe_existing_confirmed_email(
    api_client: AsyncClient,
    db_session: AsyncSession,
    mock_send_subscription_email: AsyncMock,
) -> None:
    """Rejects duplicate subscription requests for a confirmed subscriber."""
    subscriber = NewsletterSubscriber(email=EMAIL_CONFIRMED, is_confirmed=True)
    db_session.add(subscriber)
    await db_session.flush()

    response = await api_client.post("/newsletter/subscribe", json=EMAIL_CONFIRMED)
    assert response.status_code == HTTP_BAD_REQUEST
    assert MSG_ALREADY_SUB in detail_text(response.json())
    mock_send_subscription_email.assert_not_called()


async def test_confirm_subscription_success(api_client: AsyncClient, db_session: AsyncSession) -> None:
    """Confirms a pending newsletter subscription with a valid token."""
    email = EMAIL_CONFIRM_REQ
    subscriber = NewsletterSubscriber(email=email, is_confirmed=False)
    db_session.add(subscriber)
    await db_session.flush()

    test_token = create_jwt_token(email, JWTType.NEWSLETTER_CONFIRMATION)
    response = await api_client.post("/newsletter/confirm", json=test_token)

    assert response.status_code == HTTP_OK
    assert response.json()["is_confirmed"] is True

    await db_session.refresh(subscriber)
    assert subscriber.is_confirmed is True


async def test_confirm_subscription_invalid_token(api_client: AsyncClient) -> None:
    """Rejects confirmation requests with an invalid token."""
    response = await api_client.post("/newsletter/confirm", json="invalid_token")
    assert response.status_code == HTTP_BAD_REQUEST


async def test_request_unsubscribe_success(
    api_client: AsyncClient,
    db_session: AsyncSession,
    mock_send_unsubscription_email: AsyncMock,
) -> None:
    """Sends an unsubscribe email for an existing confirmed subscriber."""
    email = EMAIL_UNSUBSCRIBE
    subscriber = NewsletterSubscriber(email=email, is_confirmed=True)
    db_session.add(subscriber)
    await db_session.flush()

    response = await api_client.post("/newsletter/request-unsubscribe", json=email)
    assert response.status_code == HTTP_OK
    mock_send_unsubscription_email.assert_called_once()


async def test_unsubscribe_with_token_success(api_client: AsyncClient, db_session: AsyncSession) -> None:
    """Deletes a subscriber when given a valid unsubscribe token."""
    email = EMAIL_DELETE
    subscriber = NewsletterSubscriber(email=email, is_confirmed=True)
    db_session.add(subscriber)
    await db_session.flush()

    test_token = create_jwt_token(email, JWTType.NEWSLETTER_UNSUBSCRIBE)
    response = await api_client.post("/newsletter/unsubscribe", json=test_token)

    assert response.status_code == HTTP_NO_CONTENT
    assert await db_session.get(NewsletterSubscriber, subscriber.id) is None


async def test_confirm_subscription_already_confirmed_returns_400(
    api_client: AsyncClient, db_session: AsyncSession
) -> None:
    """Rejects confirmation for an already confirmed subscription."""
    email = "already_confirmed@example.com"
    subscriber = NewsletterSubscriber(email=email, is_confirmed=True)
    db_session.add(subscriber)
    await db_session.flush()

    token = create_jwt_token(email, JWTType.NEWSLETTER_CONFIRMATION)
    response = await api_client.post("/newsletter/confirm", json=token)

    assert response.status_code == HTTP_BAD_REQUEST
    assert "Already confirmed" in detail_text(response.json())


async def test_confirm_subscription_unknown_email_returns_404(api_client: AsyncClient) -> None:
    """Returns 404 when a confirmation token references no subscriber."""
    token = create_jwt_token("ghost@example.com", JWTType.NEWSLETTER_CONFIRMATION)
    response = await api_client.post("/newsletter/confirm", json=token)

    assert response.status_code == 404
    assert "not found" in detail_text(response.json()).lower()


async def test_unsubscribe_with_invalid_token_returns_400(api_client: AsyncClient) -> None:
    """Rejects unsubscribe requests with an invalid token."""
    response = await api_client.post("/newsletter/unsubscribe", json="not-a-valid-token")
    assert response.status_code == HTTP_BAD_REQUEST


async def test_request_unsubscribe_unknown_email_returns_safe_message(api_client: AsyncClient) -> None:
    """Returns a safe generic message for unknown unsubscribe requests."""
    response = await api_client.post("/newsletter/request-unsubscribe", json="nobody@example.com")

    assert response.status_code == HTTP_OK
    assert "If you are subscribed" in response.json()["message"]
