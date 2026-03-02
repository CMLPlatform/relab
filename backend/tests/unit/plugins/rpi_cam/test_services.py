"""Unit tests for RPi Cam plugin services."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.auth.models import OAuthAccount
from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.services import (
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
        camera = Camera(
            id=uuid4(),
            name="Test Camera",
            url="http://192.168.1.100:8080",
            encrypted_api_key=encrypt_str("secret"),
            owner_id=uuid4(),
        )

        with (
            patch("app.api.plugins.rpi_cam.services.db_get_model_with_id_if_it_exists") as mock_check_product,
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
        self, mock_oauth_account: MagicMock, mock_google_oauth_client: AsyncMock, mock_session: AsyncMock
    ) -> YouTubeService:
        """Return a YouTubeService instance with mocked dependencies."""
        return YouTubeService(mock_oauth_account, mock_google_oauth_client, mock_session)

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

    @patch("app.api.plugins.rpi_cam.services.build")
    @patch("app.api.plugins.rpi_cam.services.Credentials")
    def test_get_youtube_client(
        self, mock_creds: MagicMock, mock_build: MagicMock, youtube_service: YouTubeService
    ) -> None:
        """Test YouTube client initialization."""
        client = youtube_service.get_youtube_client()
        mock_creds.assert_called_once()
        mock_build.assert_called_once_with("youtube", "v3", credentials=mock_creds.return_value)
        assert client == mock_build.return_value

    @patch.object(YouTubeService, "get_youtube_client")
    @patch.object(YouTubeService, "refresh_token_if_needed", new_callable=AsyncMock)
    async def test_end_livestream_success(
        self, mock_refresh: AsyncMock, mock_get_client: MagicMock, youtube_service: YouTubeService
    ) -> None:
        """Test successful termination of a livestream."""
        del mock_refresh
        mock_youtube = MagicMock()
        mock_get_client.return_value = mock_youtube

        await youtube_service.end_livestream(FAKE_BROADCAST_ID)

        mock_youtube.liveBroadcasts().delete.assert_called_once_with(id=FAKE_BROADCAST_ID)

    @patch.object(YouTubeService, "get_youtube_client")
    @patch.object(YouTubeService, "refresh_token_if_needed", new_callable=AsyncMock)
    async def test_setup_livestream_success(
        self, mock_refresh: AsyncMock, mock_get_client: MagicMock, youtube_service: YouTubeService
    ) -> None:
        """Test successful setup of a new livestream."""
        del mock_refresh
        mock_youtube = MagicMock()
        mock_get_client.return_value = mock_youtube

        mock_broadcasts = MagicMock()
        mock_youtube.liveBroadcasts.return_value = mock_broadcasts
        mock_insert_broadcast = MagicMock()
        mock_broadcasts.insert.return_value = mock_insert_broadcast
        mock_insert_broadcast.execute.return_value = {"id": FAKE_BROADCAST_ID}

        mock_bind_broadcast = MagicMock()
        mock_broadcasts.bind.return_value = mock_bind_broadcast
        mock_bind_broadcast.execute.return_value = {"id": FAKE_BROADCAST_ID}

        mock_streams = MagicMock()
        mock_youtube.liveStreams.return_value = mock_streams
        mock_insert_stream = MagicMock()
        mock_streams.insert.return_value = mock_insert_stream
        mock_insert_stream.execute.return_value = {
            "id": FAKE_STREAM_ID,
            "cdn": {"ingestionInfo": {"streamName": FAKE_STREAM_NAME}},
        }

        result = await youtube_service.setup_livestream(TEST_STREAM_TITLE)

        assert result.stream_key == FAKE_STREAM_NAME
        assert result.broadcast_key == FAKE_BROADCAST_ID
        assert result.stream_id == FAKE_STREAM_ID

    @patch.object(YouTubeService, "get_youtube_client")
    @patch.object(YouTubeService, "refresh_token_if_needed", new_callable=AsyncMock)
    async def test_validate_stream_status_active(
        self, mock_refresh: AsyncMock, mock_get_client: MagicMock, youtube_service: YouTubeService
    ) -> None:
        """Test validation of an active stream status."""
        del mock_refresh
        mock_youtube = MagicMock()
        mock_get_client.return_value = mock_youtube

        mock_streams = MagicMock()
        mock_youtube.liveStreams.return_value = mock_streams
        mock_list = MagicMock()
        mock_streams.list.return_value = mock_list
        mock_list.execute.return_value = {"items": [{"status": {"streamStatus": "active"}}]}

        result = await youtube_service.validate_stream_status(FAKE_STREAM_ID)
        assert result is True
