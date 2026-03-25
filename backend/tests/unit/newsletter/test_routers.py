"""Unit tests for newsletter routers."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from sqlmodel import select

from app.api.auth.dependencies import current_active_user
from app.api.auth.models import User
from app.api.newsletter.models import NewsletterSubscriber
from app.api.newsletter.utils.tokens import JWTType, create_jwt_token
from tests.factories.models import UserFactory

if TYPE_CHECKING:
    from collections.abc import Generator

    from httpx import AsyncClient
    from sqlmodel.ext.asyncio.session import AsyncSession

# Constants for test values
EMAIL_NEW = "new@example.com"
EMAIL_EXISTING = "existing@example.com"
EMAIL_CONFIRMED = "confirmed@example.com"
EMAIL_CONFIRM_REQ = "confirm@example.com"
EMAIL_UNSUBSCRIBE = "unsubscribe@example.com"
EMAIL_DELETE = "delete@example.com"
MSG_NOT_CONFIRMED = "Already subscribed, but not confirmed"
MSG_ALREADY_SUB = "Already subscribed"
HTTP_CREATED = 201
HTTP_BAD_REQUEST = 400
HTTP_OK = 200
HTTP_NO_CONTENT = 204


@pytest.fixture
def mock_background_tasks() -> MagicMock:
    """Return a mock for background tasks."""
    return MagicMock()


@pytest.fixture
def mock_send_subscription_email() -> Generator[AsyncMock]:
    """Mock the subscription email sending function."""
    with patch("app.api.newsletter.routers.send_newsletter_subscription_email", new_callable=AsyncMock) as mocked:
        yield mocked


@pytest.fixture
def mock_send_unsubscription_email() -> Generator[AsyncMock]:
    """Mock the unsubscription email sending function."""
    with patch(
        "app.api.newsletter.routers.send_newsletter_unsubscription_request_email", new_callable=AsyncMock
    ) as mocked:
        yield mocked


@pytest.mark.asyncio
async def test_subscribe_new_email(
    async_client: AsyncClient,
    mock_send_subscription_email: AsyncMock,
) -> None:
    """Test subscribing with a new email address."""
    response = await async_client.post("/newsletter/subscribe", json=EMAIL_NEW)
    assert response.status_code == HTTP_CREATED
    data = response.json()
    assert data["email"] == EMAIL_NEW
    assert data["is_confirmed"] is False

    mock_send_subscription_email.assert_called_once()


@pytest.mark.asyncio
async def test_subscribe_existing_unconfirmed_email(
    async_client: AsyncClient,
    session: AsyncSession,
    mock_send_subscription_email: AsyncMock,
) -> None:
    """Test subscribing with an existing but unconfirmed email."""
    # Create existing subscriber
    subscriber = NewsletterSubscriber(email=EMAIL_EXISTING, is_confirmed=False)
    session.add(subscriber)
    await session.flush()

    response = await async_client.post("/newsletter/subscribe", json=EMAIL_EXISTING)
    assert response.status_code == HTTP_BAD_REQUEST
    assert MSG_NOT_CONFIRMED in response.json()["detail"]["message"]

    # Should send email again
    mock_send_subscription_email.assert_called_once()


@pytest.mark.asyncio
async def test_subscribe_existing_confirmed_email(
    async_client: AsyncClient,
    session: AsyncSession,
    mock_send_subscription_email: AsyncMock,
) -> None:
    """Test subscribing with an already confirmed email."""
    # Create existing confirmed subscriber
    subscriber = NewsletterSubscriber(email=EMAIL_CONFIRMED, is_confirmed=True)
    session.add(subscriber)
    await session.flush()

    response = await async_client.post("/newsletter/subscribe", json=EMAIL_CONFIRMED)
    assert response.status_code == HTTP_BAD_REQUEST
    assert MSG_ALREADY_SUB in response.json()["detail"]["message"]

    # Should NOT send email
    mock_send_subscription_email.assert_not_called()


@pytest.mark.asyncio
async def test_confirm_subscription_success(async_client: AsyncClient, session: AsyncSession) -> None:
    """Test successful subscription confirmation."""
    email = EMAIL_CONFIRM_REQ
    subscriber = NewsletterSubscriber(email=email, is_confirmed=False)
    session.add(subscriber)
    await session.flush()

    test_token = create_jwt_token(email, JWTType.NEWSLETTER_CONFIRMATION)

    response = await async_client.post("/newsletter/confirm", json=test_token)
    assert response.status_code == HTTP_OK
    assert response.json()["is_confirmed"] is True

    # Verify DB update
    await session.refresh(subscriber)
    assert subscriber.is_confirmed is True


@pytest.mark.asyncio
async def test_confirm_subscription_invalid_token(async_client: AsyncClient) -> None:
    """Test subscription confirmation with an invalid token."""
    response = await async_client.post("/newsletter/confirm", json="invalid_token")
    assert response.status_code == HTTP_BAD_REQUEST


@pytest.mark.asyncio
async def test_request_unsubscribe_success(
    async_client: AsyncClient,
    session: AsyncSession,
    mock_send_unsubscription_email: AsyncMock,
) -> None:
    """Test successful unsubscription request."""
    email = EMAIL_UNSUBSCRIBE
    subscriber = NewsletterSubscriber(email=email, is_confirmed=True)
    session.add(subscriber)
    await session.flush()

    response = await async_client.post("/newsletter/request-unsubscribe", json=email)
    assert response.status_code == HTTP_OK

    mock_send_unsubscription_email.assert_called_once()


@pytest.mark.asyncio
async def test_unsubscribe_with_token_success(async_client: AsyncClient, session: AsyncSession) -> None:
    """Test successful unsubscription using a token."""
    email = EMAIL_DELETE
    subscriber = NewsletterSubscriber(email=email, is_confirmed=True)
    session.add(subscriber)
    await session.flush()

    test_token = create_jwt_token(email, JWTType.NEWSLETTER_UNSUBSCRIBE)

    response = await async_client.post("/newsletter/unsubscribe", json=test_token)
    assert response.status_code == HTTP_NO_CONTENT

    # Verify deletion
    assert await session.get(NewsletterSubscriber, subscriber.id) is None


@pytest.mark.asyncio
async def test_confirm_subscription_already_confirmed_returns_400(
    async_client: AsyncClient, session: AsyncSession
) -> None:
    """Confirming an already-confirmed subscription must return 400."""
    email = "already_confirmed@example.com"
    subscriber = NewsletterSubscriber(email=email, is_confirmed=True)
    session.add(subscriber)
    await session.flush()

    token = create_jwt_token(email, JWTType.NEWSLETTER_CONFIRMATION)
    response = await async_client.post("/newsletter/confirm", json=token)

    assert response.status_code == HTTP_BAD_REQUEST
    assert "Already confirmed" in response.json()["detail"]["message"]


@pytest.mark.asyncio
async def test_confirm_subscription_unknown_email_returns_404(async_client: AsyncClient) -> None:
    """Confirming with a valid token for a non-existent subscriber must return 404."""
    email = "ghost@example.com"
    token = create_jwt_token(email, JWTType.NEWSLETTER_CONFIRMATION)

    response = await async_client.post("/newsletter/confirm", json=token)

    assert response.status_code == 404
    assert "not found" in response.json()["detail"]["message"].lower()


@pytest.mark.asyncio
async def test_unsubscribe_with_invalid_token_returns_400(async_client: AsyncClient) -> None:
    """Unsubscribing with a malformed token must return 400."""
    response = await async_client.post("/newsletter/unsubscribe", json="not-a-valid-token")

    assert response.status_code == HTTP_BAD_REQUEST


@pytest.mark.asyncio
async def test_request_unsubscribe_unknown_email_returns_safe_message(async_client: AsyncClient) -> None:
    """Requesting unsubscribe for a non-existent email returns the same safe message (no info leak)."""
    response = await async_client.post("/newsletter/request-unsubscribe", json="nobody@example.com")

    assert response.status_code == HTTP_OK
    # Must not reveal whether the email is subscribed
    assert "If you are subscribed" in response.json()["message"]


@pytest.mark.asyncio
async def test_get_newsletter_preference_returns_subscribed_state(
    async_client: AsyncClient, session: AsyncSession, test_app: FastAPI
) -> None:
    """Logged-in users should see their current newsletter consent state."""
    user: User = await UserFactory.create_async(session=session, email="pref@example.com", is_active=True)
    subscriber = NewsletterSubscriber(email=user.email, is_confirmed=True)
    session.add(subscriber)
    await session.flush()

    test_app.dependency_overrides[current_active_user] = lambda: user

    response = await async_client.get("/newsletter/me")

    assert response.status_code == HTTP_OK
    assert response.json()["email"] == user.email
    assert response.json()["subscribed"] is True
    assert response.json()["is_confirmed"] is True


@pytest.mark.asyncio
async def test_enable_newsletter_preference_without_email_verification(
    async_client: AsyncClient, session: AsyncSession, test_app: FastAPI
) -> None:
    """Logged-in users can subscribe without a verification email."""
    user: User = await UserFactory.create_async(session=session, email="signup@example.com", is_active=True)

    test_app.dependency_overrides[current_active_user] = lambda: user

    response = await async_client.put("/newsletter/me", json={"subscribed": True})

    assert response.status_code == HTTP_OK
    assert response.json()["subscribed"] is True
    assert response.json()["is_confirmed"] is True

    stored = await session.exec(select(NewsletterSubscriber).where(NewsletterSubscriber.email == user.email))
    subscriber = stored.one_or_none()
    assert subscriber is not None
    assert subscriber.is_confirmed is True


@pytest.mark.asyncio
async def test_disable_newsletter_preference_removes_subscriber(
    async_client: AsyncClient, session: AsyncSession, test_app: FastAPI
) -> None:
    """Logged-in users can opt out directly from the app."""
    user: User = await UserFactory.create_async(session=session, email="leave@example.com", is_active=True)
    subscriber = NewsletterSubscriber(email=user.email, is_confirmed=True)
    session.add(subscriber)
    await session.flush()

    test_app.dependency_overrides[current_active_user] = lambda: user

    response = await async_client.put("/newsletter/me", json={"subscribed": False})

    assert response.status_code == HTTP_OK
    assert response.json()["subscribed"] is False

    assert await session.get(NewsletterSubscriber, subscriber.id) is None


@pytest.mark.asyncio
async def test_admin_get_subscribers_returns_list(superuser_client: AsyncClient, session: AsyncSession) -> None:
    """GET /admin/newsletter/subscribers returns all subscribers for a superuser."""
    emails = ["sub1@example.com", "sub2@example.com"]
    for email in emails:
        session.add(NewsletterSubscriber(email=email, is_confirmed=True))
    await session.flush()

    response = await superuser_client.get("/admin/newsletter/subscribers")

    assert response.status_code == HTTP_OK
    returned_emails = {s["email"] for s in response.json()["items"]}
    for email in emails:
        assert email in returned_emails
