"""Shared support code for split RPi Cam service tests."""
# spell-checker: ignore excinfo

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.api.plugins.rpi_cam.services import YouTubeService

FAKE_ACCESS_TOKEN = "fake_access_token"
FAKE_REFRESH_TOKEN = "fake_refresh_token"
NEW_FAKE_ACCESS_TOKEN = "new_fake_access_token"
FAKE_STREAM_NAME = "fake_stream_name"
FAKE_BROADCAST_ID = "fake_broadcast_id"
FAKE_STREAM_ID = "fake_stream_id"
TEST_STREAM_TITLE = "Test Stream"
CAPTURE_URL = "/fake_image.jpg"
CAPTURE_TIME = "2023-01-01T00:00:00Z"
IMG_BYTES = b"fake image bytes"


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


class SessionStub:
    """Typed database session stub for service tests."""

    def __init__(self) -> None:
        self.add = MagicMock()
        self.commit = AsyncMock()
        self.delete = AsyncMock()
        self.refresh = AsyncMock()
        self.get = AsyncMock(return_value=None)


class HTTPClientStub:
    """Typed HTTP client stub for service tests."""

    def __init__(self) -> None:
        self.request = AsyncMock()


@pytest.fixture
def mock_session() -> SessionStub:
    """Return a mock database session."""
    return SessionStub()


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
        access_token=FAKE_ACCESS_TOKEN,
        refresh_token=FAKE_REFRESH_TOKEN,
        expires_at=(datetime.now(UTC) + timedelta(hours=1)).timestamp(),
    )


@pytest.fixture
def youtube_service(
    mock_oauth_account: OAuthAccountStub,
    mock_google_oauth_client: GoogleOAuthClientStub,
    mock_session: SessionStub,
    mock_http_client: HTTPClientStub,
) -> YouTubeService:
    """Return a YouTubeService instance with typed stub dependencies."""
    return YouTubeService(
        cast("Any", mock_oauth_account),
        cast("Any", mock_google_oauth_client),
        cast("Any", mock_session),
        cast("Any", mock_http_client),
    )
