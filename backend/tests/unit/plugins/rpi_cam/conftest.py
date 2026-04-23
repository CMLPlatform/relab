"""Local fixtures for split RPi Cam unit tests."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any, cast  # lgtm[py/unused-import]
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.schemas import RelayPublicKeyJWK
from app.api.plugins.rpi_cam.services import YouTubeService
from tests.factories.models import UserFactory

if TYPE_CHECKING:
    from app.api.auth.models import User


@dataclass
class OAuthAccountStub:
    """Typed OAuth account stub for service tests."""

    access_token: str
    refresh_token: str | None
    expires_at: float | None


class GoogleOAuthClientStub:
    """Typed Google OAuth client stub for service tests."""

    def __init__(self) -> None:
        self.refresh_token = AsyncMock()


class HTTPClientStub:
    """Typed HTTP client stub for service tests."""

    def __init__(self) -> None:
        self.request = AsyncMock()


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
def youtube_service(
    mock_oauth_account: OAuthAccountStub,
    mock_google_oauth_client: GoogleOAuthClientStub,
    mock_session: AsyncMock,
    mock_http_client: HTTPClientStub,
) -> YouTubeService:
    """Build a YouTubeService with stubbed dependencies."""
    return YouTubeService(
        cast("Any", mock_oauth_account),
        cast("Any", mock_google_oauth_client),
        cast("Any", mock_session),
        cast("Any", mock_http_client),
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
