"""Unit tests for RPi Cam plugin services."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from httpx import Request, Response

from app.api.auth.models import OAuthAccount
from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.services import (
    YouTubeAPIError,
    YouTubeService,
    capture_and_store_image,
)
from app.api.plugins.rpi_cam.utils.encryption import encrypt_str

# Constants for magic values
FAKE_ACCESS_TOKEN = "fake_access_token"  # noqa: S105
FAKE_REFRESH_TOKEN = "fake_refresh_token"  # noqa: S105
NEW_FAKE_ACCESS_TOKEN = "new_fake_access_token"  # noqa: S105
FAKE_STREAM_NAME = "fake_stream_name"
FAKE_BROADCAST_ID = "fake_broadcast_id"
FAKE_STREAM_ID = "fake_stream_id"
TEST_STREAM_TITLE = "Test Stream"
CAPTURE_URL = "/fake_image.jpg"
CAPTURE_TIME = "2023-01-01T00:00:00Z"
IMG_BYTES = b"fake image bytes"


def build_camera() -> Camera:
    """Build a camera for service tests."""
    return Camera(
        id=uuid4(),
        name="Test Camera",
        url="http://192.168.1.100:8080",
        encrypted_api_key=encrypt_str("secret"),
        owner_id=uuid4(),
    )


@pytest.fixture
def mock_session() -> AsyncMock:
    """Return a mock database session."""
    session = AsyncMock()
    session.add = MagicMock()
    return session


@pytest.fixture
def mock_google_oauth_client() -> AsyncMock:
    """Return a mock Google OAuth client."""
    return AsyncMock()


@pytest.fixture
def mock_http_client() -> AsyncMock:
    """Return a mock shared HTTP client."""
    return AsyncMock()


@pytest.fixture
def mock_oauth_account() -> MagicMock:
    """Return a mock OAuth account."""
    account = MagicMock(spec=OAuthAccount)
    account.access_token = FAKE_ACCESS_TOKEN
    account.refresh_token = FAKE_REFRESH_TOKEN
    # Set expiration to slightly in the future so it doesn't refresh by default
    account.expires_at = (datetime.now(UTC) + timedelta(hours=1)).timestamp()
    return account


class TestCaptureAndStoreImage:
    """Test standard image capture and storage functionality."""

    async def test_capture_and_store_image_success(self, mock_session: AsyncMock) -> None:
        """Test capture and storage of an image from a camera."""
        camera = build_camera()

        with (
            patch("app.api.plugins.rpi_cam.services.get_model_or_404") as mock_check_product,
            patch("app.api.plugins.rpi_cam.services.fetch_from_camera_url") as mock_fetch,
            patch("app.api.plugins.rpi_cam.services.create_image") as mock_create_image,
        ):
            # Two fetches: one POST to capture, one GET to download
            mock_capture_resp = MagicMock()
            mock_capture_resp.json.return_value = {
                "image_url": CAPTURE_URL,
                "metadata": {"image_properties": {"capture_time": CAPTURE_TIME}},
            }

            mock_download_resp = MagicMock()
            mock_download_resp.content = IMG_BYTES

            mock_fetch.side_effect = [mock_capture_resp, mock_download_resp]

            mock_create_image.return_value = MagicMock()

            await capture_and_store_image(
                session=mock_session,
                camera=camera,
                product_id=1,
            )

            mock_check_product.assert_called_once()
            assert mock_fetch.call_count == 2
            mock_create_image.assert_called_once()


class TestYouTubeService:
    """Test YouTube livestreaming service functionality."""

    @pytest.fixture
    def youtube_service(
        self,
        mock_oauth_account: MagicMock,
        mock_google_oauth_client: AsyncMock,
        mock_session: AsyncMock,
        mock_http_client: AsyncMock,
    ) -> YouTubeService:
        """Return a YouTubeService instance with mocked dependencies."""
        return YouTubeService(mock_oauth_account, mock_google_oauth_client, mock_session, mock_http_client)

    async def test_refresh_token_if_needed_not_expired(self, youtube_service: YouTubeService) -> None:
        """Test that token is not refreshed if not expired."""
        # expires_at is in the future
        await youtube_service.refresh_token_if_needed()
        youtube_service.google_oauth_client.refresh_token.assert_not_called()

    async def test_refresh_token_if_needed_expired_success(self, youtube_service: YouTubeService) -> None:
        """Test successful token refresh when expired."""
        # Set to expired
        youtube_service.oauth_account.expires_at = (datetime.now(UTC) - timedelta(hours=1)).timestamp()

        youtube_service.google_oauth_client.refresh_token.return_value = {
            "access_token": NEW_FAKE_ACCESS_TOKEN,
            "expires_in": 3600,
        }

        await youtube_service.refresh_token_if_needed()

        youtube_service.google_oauth_client.refresh_token.assert_called_once_with(FAKE_REFRESH_TOKEN)
        assert youtube_service.oauth_account.access_token == NEW_FAKE_ACCESS_TOKEN
        youtube_service.session.add.assert_called_once()
        youtube_service.session.commit.assert_called_once()

    async def test_refresh_token_missing_token(self, youtube_service: YouTubeService) -> None:
        """Test refresh failure when refresh token is missing."""
        youtube_service.oauth_account.expires_at = (datetime.now(UTC) - timedelta(hours=1)).timestamp()
        youtube_service.oauth_account.refresh_token = None

        with pytest.raises(HTTPException, match="OAuth refresh token expired or missing"):
            await youtube_service.refresh_token_if_needed()

    async def test_request_youtube_api_uses_bearer_auth(self, youtube_service: YouTubeService) -> None:
        """Test YouTube API requests use the async shared client with bearer auth."""
        response = Response(200, json={"ok": True}, request=Request("GET", "https://www.googleapis.com/youtube/v3/test-endpoint"))
        youtube_service.http_client.request.return_value = response

        result = await youtube_service.request_youtube_api("GET", "test-endpoint")

        assert result == {"ok": True}
        youtube_service.http_client.request.assert_awaited_once_with(
            "GET",
            "https://www.googleapis.com/youtube/v3/test-endpoint",
            params=None,
            json=None,
            headers={"Authorization": f"Bearer {FAKE_ACCESS_TOKEN}"},
        )

    @patch.object(YouTubeService, "request_youtube_api", new_callable=AsyncMock)
    @patch.object(YouTubeService, "refresh_token_if_needed", new_callable=AsyncMock)
    async def test_end_livestream_success(
        self,
        mock_refresh: AsyncMock,
        mock_request_youtube_api: AsyncMock,
        youtube_service: YouTubeService,
    ) -> None:
        """Test successful termination of a livestream."""
        del mock_refresh

        await youtube_service.end_livestream(FAKE_BROADCAST_ID)

        mock_request_youtube_api.assert_awaited_once_with(
            "DELETE",
            "liveBroadcasts",
            params={"id": FAKE_BROADCAST_ID},
        )

    @patch.object(YouTubeService, "request_youtube_api", new_callable=AsyncMock)
    @patch.object(YouTubeService, "refresh_token_if_needed", new_callable=AsyncMock)
    async def test_setup_livestream_success(
        self,
        mock_refresh: AsyncMock,
        mock_request_youtube_api: AsyncMock,
        youtube_service: YouTubeService,
    ) -> None:
        """Test successful setup of a new livestream."""
        del mock_refresh
        mock_request_youtube_api.side_effect = [
            {"id": FAKE_BROADCAST_ID},
            {
                "id": FAKE_STREAM_ID,
                "cdn": {"ingestionInfo": {"streamName": FAKE_STREAM_NAME}},
            },
            {"id": FAKE_BROADCAST_ID},
        ]

        result = await youtube_service.setup_livestream(TEST_STREAM_TITLE)

        assert result.stream_key == FAKE_STREAM_NAME
        assert result.broadcast_key == FAKE_BROADCAST_ID
        assert result.stream_id == FAKE_STREAM_ID

    @patch.object(YouTubeService, "request_youtube_api", new_callable=AsyncMock)
    @patch.object(YouTubeService, "refresh_token_if_needed", new_callable=AsyncMock)
    async def test_validate_stream_status_active(
        self,
        mock_refresh: AsyncMock,
        mock_request_youtube_api: AsyncMock,
        youtube_service: YouTubeService,
    ) -> None:
        """Test validation of an active stream status."""
        del mock_refresh
        mock_request_youtube_api.return_value = {"items": [{"status": {"streamStatus": "active"}}]}

        result = await youtube_service.validate_stream_status(FAKE_STREAM_ID)
        assert result is True

    @patch.object(YouTubeService, "request_youtube_api", new_callable=AsyncMock)
    @patch.object(YouTubeService, "refresh_token_if_needed", new_callable=AsyncMock)
    async def test_setup_livestream_invalid_stream_response(
        self,
        mock_refresh: AsyncMock,
        mock_request_youtube_api: AsyncMock,
        youtube_service: YouTubeService,
    ) -> None:
        """Test invalid stream payloads are surfaced as API errors."""
        del mock_refresh
        mock_request_youtube_api.side_effect = [
            {"id": FAKE_BROADCAST_ID},
            {"id": FAKE_STREAM_ID},
        ]

        with pytest.raises(YouTubeAPIError) as exc_info:
            await youtube_service.setup_livestream(TEST_STREAM_TITLE)
        assert exc_info.value.details is not None
        assert "Invalid YouTube stream response" in exc_info.value.details

    @patch.object(YouTubeService, "request_youtube_api", new_callable=AsyncMock)
    @patch.object(YouTubeService, "refresh_token_if_needed", new_callable=AsyncMock)
    async def test_validate_stream_status_missing_items(
        self,
        mock_refresh: AsyncMock,
        mock_request_youtube_api: AsyncMock,
        youtube_service: YouTubeService,
    ) -> None:
        """Test missing stream items are treated as a YouTube API error."""
        del mock_refresh
        mock_request_youtube_api.return_value = {"items": []}

        with pytest.raises(YouTubeAPIError) as exc_info:
            await youtube_service.validate_stream_status(FAKE_STREAM_ID)
        assert exc_info.value.details is not None
        assert "stream not found" in exc_info.value.details
