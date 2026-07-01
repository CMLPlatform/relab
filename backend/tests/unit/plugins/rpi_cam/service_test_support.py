"""Shared support code for split RPi Cam service tests."""
# spell-checker: ignore excinfo

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from app.api.plugins.rpi_cam.services.youtube import YouTubeService

if TYPE_CHECKING:
    from typing import Any

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


class HTTPClientStub:
    """Typed HTTP client stub for service tests."""

    def __init__(self) -> None:
        self.request = AsyncMock()


@dataclass
class YouTubeServiceFixture:
    """Bundle the YouTubeService under test with its typed stub dependencies."""

    service: YouTubeService
    oauth_account: OAuthAccountStub
    google_client: GoogleOAuthClientStub
    session: Any
    http_client: HTTPClientStub
