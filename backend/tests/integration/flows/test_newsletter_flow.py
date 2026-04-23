"""Integration tests for newsletter subscription flows."""

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import status
from sqlalchemy import select

from app.api.newsletter.models import NewsletterSubscriber
from app.api.newsletter.utils.tokens import JWTType, create_jwt_token

if TYPE_CHECKING:
    from collections.abc import Generator

    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession


pytestmark = pytest.mark.flow

# Constants for test values
FLOW_EMAIL = "integration_flow@example.com"
IS_CONFIRMED = "is_confirmed"


@pytest.fixture
def mock_send_subscription_email() -> Generator[AsyncMock]:
    """Fixture to mock newsletter subscription email sending."""
    with patch("app.api.newsletter.routers.send_newsletter_subscription_email", new_callable=AsyncMock) as mock:
        yield mock


@pytest.fixture
def mock_send_unsubscription_email() -> Generator[AsyncMock]:
    """Fixture to mock newsletter unsubscription request email sending."""
    with patch(
        "app.api.newsletter.routers.send_newsletter_unsubscription_request_email", new_callable=AsyncMock
    ) as mock:
        yield mock


async def test_newsletter_subscription_lifecycle(
    api_client: AsyncClient,
    db_session: AsyncSession,
    mock_send_subscription_email: AsyncMock,
    mock_send_unsubscription_email: AsyncMock,
) -> None:
    """Test the full lifecycle of a newsletter subscription.

    Lifecycle:
    1. Subscribe
    2. Confirm
    3. Request Unsubscribe
    4. Unsubscribe
    """
    # 1. Subscribe
    response = await api_client.post("/newsletter/subscribe", json=FLOW_EMAIL)
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["email"] == FLOW_EMAIL
    # Check is_confirmed if present in response
    if IS_CONFIRMED in data:
        assert data[IS_CONFIRMED] is False

    # Verify DB state
    stmt = select(NewsletterSubscriber).where(NewsletterSubscriber.email == FLOW_EMAIL)
    result = await db_session.execute(stmt)
    subscriber = result.scalar_one_or_none()
    assert subscriber is not None
    assert subscriber.is_confirmed is False

    mock_send_subscription_email.assert_called_once()

    # 2. Confirm
    # Manually generate token as we can't easily intercept the one sent in email in this test setup
    token = create_jwt_token(FLOW_EMAIL, JWTType.NEWSLETTER_CONFIRMATION)

    response = await api_client.post("/newsletter/confirm", json=token)
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["is_confirmed"] is True

    # Verify DB state
    await db_session.refresh(subscriber)
    assert subscriber.is_confirmed is True

    # 3. Request Unsubscribe
    response = await api_client.post("/newsletter/request-unsubscribe", json=FLOW_EMAIL)
    assert response.status_code == status.HTTP_200_OK

    mock_send_unsubscription_email.assert_called_once()

    # 4. Unsubscribe
    unsubscribe_token = create_jwt_token(FLOW_EMAIL, JWTType.NEWSLETTER_UNSUBSCRIBE)

    response = await api_client.post("/newsletter/unsubscribe", json=unsubscribe_token)
    assert response.status_code == status.HTTP_204_NO_CONTENT

    # Verify DB state
    result = await db_session.execute(stmt)
    subscriber = result.scalar_one_or_none()
    assert subscriber is None
