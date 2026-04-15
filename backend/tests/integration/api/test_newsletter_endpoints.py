"""Unit tests for newsletter routers."""

from __future__ import annotations

from typing import TYPE_CHECKING, cast
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from sqlalchemy import select

from app.api.auth.models import User
from app.api.newsletter.models import NewsletterSubscriber
from app.api.newsletter.utils.tokens import JWTType, create_jwt_token
from tests.factories.models import UserFactory
from tests.fixtures.client import override_authenticated_user

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator, Generator

    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

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


def _detail_text(payload: dict[str, object]) -> str:
    """Return a comparable error-detail string across supported error shapes."""
    detail = payload["detail"]
    if isinstance(detail, dict):
        detail_dict = cast("dict[str, object]", detail)
        return str(detail_dict.get("message") or "")
    return str(detail)


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


@pytest.fixture
async def newsletter_user(db_session: AsyncSession) -> User:
    """Create an active user for newsletter preference tests."""
    return await UserFactory.create_async(session=db_session, is_active=True)


@pytest.fixture
async def newsletter_user_client(
    api_client: AsyncClient, newsletter_user: User, test_app: FastAPI
) -> AsyncGenerator[AsyncClient]:
    """Provide an authenticated client for newsletter preference endpoints."""
    with override_authenticated_user(test_app, newsletter_user, verified=False, optional=False):
        yield api_client


@pytest.mark.asyncio
async def test_subscribe_new_email(
    api_client: AsyncClient,
    mock_send_subscription_email: AsyncMock,
) -> None:
    """Test subscribing with a new email address."""
    response = await api_client.post("/newsletter/subscribe", json=EMAIL_NEW)
    assert response.status_code == HTTP_CREATED
    data = response.json()
    assert data["email"] == EMAIL_NEW
    assert data["is_confirmed"] is False

    mock_send_subscription_email.assert_called_once()


@pytest.mark.asyncio
async def test_subscribe_existing_unconfirmed_email(
    api_client: AsyncClient,
    db_session: AsyncSession,
    mock_send_subscription_email: AsyncMock,
) -> None:
    """Test subscribing with an existing but unconfirmed email."""
    # Create existing subscriber
    subscriber = NewsletterSubscriber(email=EMAIL_EXISTING, is_confirmed=False)
    db_session.add(subscriber)
    await db_session.flush()

    response = await api_client.post("/newsletter/subscribe", json=EMAIL_EXISTING)
    assert response.status_code == HTTP_BAD_REQUEST
    assert MSG_NOT_CONFIRMED in _detail_text(response.json())

    # Should send email again
    mock_send_subscription_email.assert_called_once()


@pytest.mark.asyncio
async def test_subscribe_existing_confirmed_email(
    api_client: AsyncClient,
    db_session: AsyncSession,
    mock_send_subscription_email: AsyncMock,
) -> None:
    """Test subscribing with an already confirmed email."""
    # Create existing confirmed subscriber
    subscriber = NewsletterSubscriber(email=EMAIL_CONFIRMED, is_confirmed=True)
    db_session.add(subscriber)
    await db_session.flush()

    response = await api_client.post("/newsletter/subscribe", json=EMAIL_CONFIRMED)
    assert response.status_code == HTTP_BAD_REQUEST
    assert MSG_ALREADY_SUB in _detail_text(response.json())

    # Should NOT send email
    mock_send_subscription_email.assert_not_called()


@pytest.mark.asyncio
async def test_confirm_subscription_success(api_client: AsyncClient, db_session: AsyncSession) -> None:
    """Test successful subscription confirmation."""
    email = EMAIL_CONFIRM_REQ
    subscriber = NewsletterSubscriber(email=email, is_confirmed=False)
    db_session.add(subscriber)
    await db_session.flush()

    test_token = create_jwt_token(email, JWTType.NEWSLETTER_CONFIRMATION)

    response = await api_client.post("/newsletter/confirm", json=test_token)
    assert response.status_code == HTTP_OK
    assert response.json()["is_confirmed"] is True

    # Verify DB update
    await db_session.refresh(subscriber)
    assert subscriber.is_confirmed is True


@pytest.mark.asyncio
async def test_confirm_subscription_invalid_token(api_client: AsyncClient) -> None:
    """Test subscription confirmation with an invalid token."""
    response = await api_client.post("/newsletter/confirm", json="invalid_token")
    assert response.status_code == HTTP_BAD_REQUEST


@pytest.mark.asyncio
async def test_request_unsubscribe_success(
    api_client: AsyncClient,
    db_session: AsyncSession,
    mock_send_unsubscription_email: AsyncMock,
) -> None:
    """Test successful unsubscription request."""
    email = EMAIL_UNSUBSCRIBE
    subscriber = NewsletterSubscriber(email=email, is_confirmed=True)
    db_session.add(subscriber)
    await db_session.flush()

    response = await api_client.post("/newsletter/request-unsubscribe", json=email)
    assert response.status_code == HTTP_OK

    mock_send_unsubscription_email.assert_called_once()


@pytest.mark.asyncio
async def test_unsubscribe_with_token_success(api_client: AsyncClient, db_session: AsyncSession) -> None:
    """Test successful unsubscription using a token."""
    email = EMAIL_DELETE
    subscriber = NewsletterSubscriber(email=email, is_confirmed=True)
    db_session.add(subscriber)
    await db_session.flush()

    test_token = create_jwt_token(email, JWTType.NEWSLETTER_UNSUBSCRIBE)

    response = await api_client.post("/newsletter/unsubscribe", json=test_token)
    assert response.status_code == HTTP_NO_CONTENT

    # Verify deletion
    assert await db_session.get(NewsletterSubscriber, subscriber.id) is None


@pytest.mark.asyncio
async def test_confirm_subscription_already_confirmed_returns_400(
    api_client: AsyncClient, db_session: AsyncSession
) -> None:
    """Confirming an already-confirmed subscription must return 400."""
    email = "already_confirmed@example.com"
    subscriber = NewsletterSubscriber(email=email, is_confirmed=True)
    db_session.add(subscriber)
    await db_session.flush()

    token = create_jwt_token(email, JWTType.NEWSLETTER_CONFIRMATION)
    response = await api_client.post("/newsletter/confirm", json=token)

    assert response.status_code == HTTP_BAD_REQUEST
    assert "Already confirmed" in _detail_text(response.json())


@pytest.mark.asyncio
async def test_confirm_subscription_unknown_email_returns_404(api_client: AsyncClient) -> None:
    """Confirming with a valid token for a non-existent subscriber must return 404."""
    email = "ghost@example.com"
    token = create_jwt_token(email, JWTType.NEWSLETTER_CONFIRMATION)

    response = await api_client.post("/newsletter/confirm", json=token)

    assert response.status_code == 404
    assert "not found" in _detail_text(response.json()).lower()


@pytest.mark.asyncio
async def test_unsubscribe_with_invalid_token_returns_400(api_client: AsyncClient) -> None:
    """Unsubscribing with a malformed token must return 400."""
    response = await api_client.post("/newsletter/unsubscribe", json="not-a-valid-token")

    assert response.status_code == HTTP_BAD_REQUEST


@pytest.mark.asyncio
async def test_request_unsubscribe_unknown_email_returns_safe_message(api_client: AsyncClient) -> None:
    """Requesting unsubscribe for a non-existent email returns the same safe message (no info leak)."""
    response = await api_client.post("/newsletter/request-unsubscribe", json="nobody@example.com")

    assert response.status_code == HTTP_OK
    # Must not reveal whether the email is subscribed
    assert "If you are subscribed" in response.json()["message"]


@pytest.mark.asyncio
async def test_get_newsletter_preference_returns_subscribed_state(
    newsletter_user_client: AsyncClient,
    newsletter_user: User,
    db_session: AsyncSession,
) -> None:
    """Logged-in users should see their current newsletter consent state."""
    newsletter_user.email = "pref@example.com"
    db_session.add(newsletter_user)
    await db_session.flush()

    subscriber = NewsletterSubscriber(email=newsletter_user.email, is_confirmed=True)
    db_session.add(subscriber)
    await db_session.flush()

    response = await newsletter_user_client.get("/newsletter/me")

    assert response.status_code == HTTP_OK
    assert response.json()["email"] == newsletter_user.email
    assert response.json()["subscribed"] is True
    assert response.json()["is_confirmed"] is True


@pytest.mark.asyncio
async def test_enable_newsletter_preference_without_email_verification(
    newsletter_user_client: AsyncClient,
    newsletter_user: User,
    db_session: AsyncSession,
) -> None:
    """Logged-in users can subscribe without a verification email."""
    newsletter_user.email = "signup@example.com"
    db_session.add(newsletter_user)
    await db_session.flush()

    response = await newsletter_user_client.put("/newsletter/me", json={"subscribed": True})

    assert response.status_code == HTTP_OK
    assert response.json()["subscribed"] is True
    assert response.json()["is_confirmed"] is True

    stored = await db_session.execute(
        select(NewsletterSubscriber).where(NewsletterSubscriber.email == newsletter_user.email)
    )
    subscriber = stored.scalar_one_or_none()
    assert subscriber is not None
    assert subscriber.is_confirmed is True


@pytest.mark.asyncio
async def test_disable_newsletter_preference_removes_subscriber(
    newsletter_user_client: AsyncClient,
    newsletter_user: User,
    db_session: AsyncSession,
) -> None:
    """Logged-in users can opt out directly from the app."""
    newsletter_user.email = "leave@example.com"
    db_session.add(newsletter_user)
    await db_session.flush()

    subscriber = NewsletterSubscriber(email=newsletter_user.email, is_confirmed=True)
    db_session.add(subscriber)
    await db_session.flush()

    response = await newsletter_user_client.put("/newsletter/me", json={"subscribed": False})

    assert response.status_code == HTTP_OK
    assert response.json()["subscribed"] is False

    assert await db_session.get(NewsletterSubscriber, subscriber.id) is None


@pytest.mark.asyncio
async def test_admin_get_subscribers_returns_list(
    api_client_superuser: AsyncClient, db_session: AsyncSession
) -> None:
    """GET /admin/newsletter/subscribers returns all subscribers for a superuser."""
    emails = ["sub1@example.com", "sub2@example.com"]
    for email in emails:
        db_session.add(NewsletterSubscriber(email=email, is_confirmed=True))
    await db_session.flush()

    response = await api_client_superuser.get("/admin/newsletter/subscribers")

    assert response.status_code == HTTP_OK
    returned_emails = {s["email"] for s in response.json()["items"]}
    for email in emails:
        assert email in returned_emails
