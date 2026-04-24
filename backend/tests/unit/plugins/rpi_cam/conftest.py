"""Local fixtures for split RPi Cam unit tests."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any, cast
from uuid import uuid4

import pytest

from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.schemas import RelayPublicKeyJWK
from app.api.plugins.rpi_cam.services import YouTubeService
from tests.factories.models import UserFactory
from tests.unit.plugins.rpi_cam.service_test_support import (
    GoogleOAuthClientStub,
    HTTPClientStub,
    OAuthAccountStub,
    YouTubeServiceFixture,
)

if TYPE_CHECKING:
    from unittest.mock import AsyncMock

    from app.api.auth.models import User


@pytest.fixture
def mock_google_oauth_client() -> GoogleOAuthClientStub:
    """Return a mock Google OAuth client."""
    return GoogleOAuthClientStub()


@pytest.fixture
def mock_http_client() -> HTTPClientStub:
    """Return a mock shared HTTP client."""
    return HTTPClientStub()


@pytest.fixture
def mock_oauth_account() -> OAuthAccountStub:
    """Return a mock OAuth account."""
    return OAuthAccountStub(
        access_token="fake_access_token",
        refresh_token="fake_refresh_token",
        expires_at=(datetime.now(UTC) + timedelta(hours=1)).timestamp(),
    )


@pytest.fixture
def youtube_fx(
    mock_oauth_account: OAuthAccountStub,
    mock_google_oauth_client: GoogleOAuthClientStub,
    mock_session: AsyncMock,
    mock_http_client: HTTPClientStub,
) -> YouTubeServiceFixture:
    """Return a YouTubeService under test together with its typed stub dependencies."""
    service = YouTubeService(
        cast("Any", mock_oauth_account),
        cast("Any", mock_google_oauth_client),
        cast("Any", mock_session),
        cast("Any", mock_http_client),
    )
    return YouTubeServiceFixture(
        service=service,
        oauth_account=mock_oauth_account,
        google_client=mock_google_oauth_client,
        session=cast("Any", mock_session),
        http_client=mock_http_client,
    )


@pytest.fixture
def mock_user() -> User:
    """Return a mock user for stream-router tests."""
    user = UserFactory.build(
        id=uuid4(),
        email="test@example.com",
        is_active=True,
        is_verified=True,
        hashed_password="hashed_password",
    )
    assert user.id is not None
    return user


@pytest.fixture
def mock_camera(mock_user: User) -> Camera:
    """Return a mock camera for stream-router tests."""
    assert mock_user.id is not None
    return Camera(
        id=uuid4(),
        name="Test Camera",
        description="Test Camera",
        relay_public_key_jwk=RelayPublicKeyJWK(
            kty="EC",
            crv="P-256",
            x="x",
            y="y",
            kid="test-key-id",
        ).model_dump(),
        relay_key_id="test-key-id",
        owner_id=mock_user.id,
    )
