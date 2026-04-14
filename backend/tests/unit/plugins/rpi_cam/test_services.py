"""Unit tests for RPi Cam plugin services."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from httpx import Request, Response

from app.api.common.exceptions import BadRequestError, ConflictError, ServiceUnavailableError
from app.api.plugins.rpi_cam.exceptions import GoogleOAuthAssociationRequiredError
from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.schemas.youtube import YouTubeMonitorStreamResponse
from app.api.plugins.rpi_cam.services import (
    YouTubeAPIError,
    YouTubeService,
    capture_and_store_image,
    load_recording_session,
    store_recording_session,
)

# Constants for magic values
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
        self.refresh = AsyncMock()


class HTTPClientStub:
    """Typed HTTP client stub for service tests."""

    def __init__(self) -> None:
        self.request = AsyncMock()


def build_camera() -> Camera:
    """Build a camera for service tests."""
    owner_id = uuid4()
    return Camera(
        id=uuid4(),
        name="Test Camera",
        relay_public_key_jwk={"kty": "EC", "crv": "P-256", "x": "x", "y": "y"},
        relay_key_id="test-key-id",
        owner_id=owner_id,
    )


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
    # Set expiration to slightly in the future so it doesn't refresh by default
    return OAuthAccountStub(
        access_token=FAKE_ACCESS_TOKEN,
        refresh_token=FAKE_REFRESH_TOKEN,
        expires_at=(datetime.now(UTC) + timedelta(hours=1)).timestamp(),
    )


class TestCaptureAndStoreImage:
    """Test standard image capture and storage functionality."""

    async def test_capture_and_store_image_success(self, mock_session: AsyncMock) -> None:
        """Test capture and storage of an image from a camera."""
        camera = build_camera()

        with (
            patch("app.api.plugins.rpi_cam.services.get_model_or_404") as mock_check_product,
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

            mock_camera_request = AsyncMock(side_effect=[mock_capture_resp, mock_download_resp])

            mock_create_image.return_value = MagicMock()

            await capture_and_store_image(
                session=mock_session,
                camera=camera,
                camera_request=mock_camera_request,
                product_id=1,
            )

            mock_check_product.assert_called_once()
            assert mock_camera_request.await_count == 2
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
        return YouTubeService(
            cast("Any", mock_oauth_account),
            cast("Any", mock_google_oauth_client),
            cast("Any", mock_session),
            cast("Any", mock_http_client),
        )

    async def test_refresh_token_if_needed_not_expired(self, youtube_service: YouTubeService) -> None:
        """Test that token is not refreshed if not expired."""
        # expires_at is in the future
        await youtube_service.refresh_token_if_needed()
        google_client = cast("Any", youtube_service.google_oauth_client)
        google_client.refresh_token.assert_not_called()

    async def test_refresh_token_if_needed_expired_success(self, youtube_service: YouTubeService) -> None:
        """Test successful token refresh when expired."""
        # Set to expired
        oauth_account = cast("Any", youtube_service.oauth_account)
        oauth_account.expires_at = (datetime.now(UTC) - timedelta(hours=1)).timestamp()

        google_client = cast("Any", youtube_service.google_oauth_client)
        google_client.refresh_token.return_value = {
            "access_token": NEW_FAKE_ACCESS_TOKEN,
            "expires_in": 3600,
        }

        await youtube_service.refresh_token_if_needed()

        google_client.refresh_token.assert_called_once_with(FAKE_REFRESH_TOKEN)
        assert oauth_account.access_token == NEW_FAKE_ACCESS_TOKEN
        session = cast("Any", youtube_service.session)
        session.add.assert_called_once()
        session.commit.assert_awaited_once()

    async def test_refresh_token_missing_token(self, youtube_service: YouTubeService) -> None:
        """Test refresh failure when refresh token is missing."""
        oauth_account = cast("Any", youtube_service.oauth_account)
        oauth_account.expires_at = (datetime.now(UTC) - timedelta(hours=1)).timestamp()
        oauth_account.refresh_token = None

        with pytest.raises(GoogleOAuthAssociationRequiredError, match="Google OAuth account association required"):
            await youtube_service.refresh_token_if_needed()

    async def test_request_youtube_api_uses_bearer_auth(self, youtube_service: YouTubeService) -> None:
        """Test YouTube API requests use the async shared client with bearer auth."""
        response = Response(
            200, json={"ok": True}, request=Request("GET", "https://www.googleapis.com/youtube/v3/test-endpoint")
        )
        http_client = cast("Any", youtube_service.http_client)
        http_client.request.return_value = response

        result = await youtube_service.request_youtube_api("GET", "test-endpoint")

        assert result == {"ok": True}
        http_client.request.assert_awaited_once_with(
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

        assert result.stream_key.get_secret_value() == FAKE_STREAM_NAME
        assert result.broadcast_key.get_secret_value() == FAKE_BROADCAST_ID
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
    async def test_get_broadcast_monitor_stream_success(
        self,
        mock_refresh: AsyncMock,
        mock_request_youtube_api: AsyncMock,
        youtube_service: YouTubeService,
    ) -> None:
        """Test fetching the YouTube monitor stream configuration."""
        del mock_refresh
        mock_request_youtube_api.return_value = {
            "items": [
                {
                    "id": FAKE_BROADCAST_ID,
                    "contentDetails": {
                        "monitorStream": {
                            "enableMonitorStream": True,
                            "broadcastStreamDelayMs": 0,
                            "embedHtml": "<iframe />",
                        }
                    },
                }
            ]
        }

        result = await youtube_service.get_broadcast_monitor_stream(FAKE_BROADCAST_ID)
        assert result == YouTubeMonitorStreamResponse(
            enableMonitorStream=True,
            broadcastStreamDelayMs=0,
            embedHtml="<iframe />",
        )
        mock_request_youtube_api.assert_awaited_once_with(
            "GET",
            "liveBroadcasts",
            params={"part": "contentDetails", "id": FAKE_BROADCAST_ID},
        )

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


class TestRecordingSessionHelpers:
    """Test cached YouTube recording session helpers."""

    @patch("app.api.plugins.rpi_cam.services.set_redis_value", new_callable=AsyncMock, return_value=False)
    async def test_store_recording_session_raises_internal_error_when_redis_set_fails(
        self, mock_set_redis_value: AsyncMock
    ) -> None:
        """Failed Redis writes should surface as internal API errors."""
        redis_mock = AsyncMock()
        session = MagicMock()
        session.model_dump_json.return_value = '{"product_id":1}'

        with pytest.raises(ServiceUnavailableError, match="Failed to store YouTube recording session in Redis"):
            await store_recording_session(redis_mock, uuid4(), session)
        mock_set_redis_value.assert_awaited_once()

    @patch("app.api.plugins.rpi_cam.services.get_redis_value", new_callable=AsyncMock, return_value=None)
    async def test_load_recording_session_raises_conflict_when_missing(self, mock_get_redis_value: AsyncMock) -> None:
        """Missing cached recording sessions should raise a conflict error."""
        redis_mock = AsyncMock()

        with pytest.raises(ConflictError, match="No cached YouTube recording session found"):
            await load_recording_session(redis_mock, uuid4())
        mock_get_redis_value.assert_awaited_once()

    @patch("app.api.plugins.rpi_cam.services.get_redis_value", new_callable=AsyncMock)
    async def test_load_recording_session_raises_bad_request_on_invalid_payload(
        self, mock_get_redis_value: AsyncMock
    ) -> None:
        """Invalid cached payloads should raise a validation-style API error."""
        redis_mock = AsyncMock()
        mock_get_redis_value.return_value = '{"product_id":"not-an-int"}'

        with pytest.raises(BadRequestError, match="Invalid recording session data"):
            await load_recording_session(redis_mock, uuid4())
