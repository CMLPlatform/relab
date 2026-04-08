"""Unit tests for RPi Cam stream routers."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import Request
from httpx import Response

from app.api.auth.models import OAuthAccount, User
from app.api.auth.services.oauth_clients import google_youtube_oauth_client
from app.api.file_storage.models import Video
from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.routers.camera_interaction.streams import (
    YouTubePrivacyStatus,
    get_camera_stream_status,
    get_recording_monitor_stream,
    start_recording,
    stop_all_streams,
    stop_recording,
)
from app.api.plugins.rpi_cam.schemas.youtube import YouTubeMonitorStreamResponse
from app.api.plugins.rpi_cam.services import YoutubeStreamConfigWithID
from tests.factories.models import UserFactory

if TYPE_CHECKING:
    from uuid import UUID

# Constants for test values
TEST_EMAIL = "test@example.com"
TEST_HASHED_PASSWORD = "hashed_password"
TEST_CAMERA_NAME = "Test Camera"
TEST_CAMERA_DESC = "A test camera"
TEST_STREAM_URL = "http://stream.url"
TEST_PLAYLIST_FILE = "playlist.m3u8"
YOUTUBE_STREAM_URL = "http://youtube.stream"
PREVIEW_STREAM_URL = "http://preview.stream"
FAKE_ACCESS_TOKEN = "test"
FAKE_ACCOUNT_ID = "123"
FAKE_ACCOUNT_EMAIL = "test@test.com"
FAKE_STREAM_KEY = "key"
FAKE_BROADCAST_KEY = "bcast"
FAKE_STREAM_ID = "stream"
HTTP_OK = 200
HTTP_NO_CONTENT = 204
VIDEO_CREATED_MSG = "Video Created"
TEMPLATE_HTML_CONTENT = "Template HTML"
HLS_DATA_CONTENT = b"hls data"


def require_uuid(value: UUID | None) -> UUID:
    """Narrow optional UUID values produced by SQLModel/Pydantic models."""
    assert value is not None
    return value


@pytest.fixture
def mock_user() -> User:
    """Return a mock user for testing."""
    user = UserFactory.build(
        id=uuid4(),
        email=TEST_EMAIL,
        is_active=True,
        is_verified=True,
        hashed_password=TEST_HASHED_PASSWORD,
    )
    assert user.id is not None
    return user


def build_user() -> User:
    """Build a user for stream router tests."""
    user = UserFactory.build(
        id=uuid4(),
        email=TEST_EMAIL,
        is_active=True,
        is_verified=True,
        hashed_password=TEST_HASHED_PASSWORD,
    )
    assert user.id is not None
    return user


@pytest.fixture
def mock_camera(mock_user: User) -> Camera:
    """Return a mock camera for testing."""
    owner_id = require_uuid(mock_user.id)
    return Camera(
        id=uuid4(),
        name=TEST_CAMERA_NAME,
        description=TEST_CAMERA_DESC,
        url="http://localhost:8000",
        encrypted_api_key="encrypted_key",
        owner_id=owner_id,
    )


class TestCameraStreamRouters:
    """Test suite for camera streaming router endpoints."""

    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.get_user_owned_camera")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.build_camera_request")
    async def test_get_camera_stream_status_success(
        self, mock_build_camera_request: MagicMock, mock_get_cam: MagicMock, mock_camera: Camera
    ) -> None:
        """Test retrieving the current streaming status of a camera."""
        mock_get_cam.return_value = mock_camera
        session_mock = AsyncMock()
        http_client = AsyncMock()
        user_mock = build_user()
        camera_id = require_uuid(mock_camera.id)

        mock_camera_request = AsyncMock(
            return_value=Response(
                HTTP_OK,
                json={
                    "url": TEST_STREAM_URL,
                    "mode": "youtube",
                    "started_at": "2026-02-26T10:00:00Z",
                    "metadata": {"camera_properties": {}, "capture_metadata": {}},
                },
            )
        )
        mock_build_camera_request.return_value = mock_camera_request

        result = await get_camera_stream_status(camera_id, session_mock, http_client, user_mock)
        assert str(result.url) == f"{TEST_STREAM_URL}/"

    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.get_user_owned_camera")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.build_camera_request")
    async def test_stop_all_streams(
        self, mock_build_camera_request: MagicMock, mock_get_cam: MagicMock, mock_camera: Camera
    ) -> None:
        """Test stopping all active streams for a camera."""
        mock_get_cam.return_value = mock_camera

        session_mock = AsyncMock()
        http_client = AsyncMock()
        user_mock = build_user()
        camera_id = require_uuid(mock_camera.id)

        mock_camera_request = AsyncMock(return_value=Response(HTTP_NO_CONTENT))
        mock_build_camera_request.return_value = mock_camera_request

        await stop_all_streams(camera_id, session_mock, http_client, user_mock)
        mock_camera_request.assert_awaited_once()

    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.get_user_owned_camera")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.build_camera_request")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.YouTubeService")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.get_model_or_404")
    async def test_start_recording(
        self,
        mock_db_check: MagicMock,
        mock_yt_service_class: MagicMock,
        mock_build_camera_request: MagicMock,
        mock_get_cam: MagicMock,
        mock_camera: Camera,
    ) -> None:
        """Test initiating a recording/livestream to YouTube."""
        del mock_db_check
        mock_get_cam.return_value = mock_camera

        # Mock session scalar for OAuthAccount
        session_mock = AsyncMock()
        oauth_account = OAuthAccount(
            id=uuid4(),
            user_id=uuid4(),
            oauth_name="google",
            access_token=FAKE_ACCESS_TOKEN,
            expires_at=None,
            refresh_token=None,
            account_id=FAKE_ACCOUNT_ID,
            account_email=FAKE_ACCOUNT_EMAIL,
        )
        session_mock.scalar.return_value = oauth_account

        # Mock Youtube service
        mock_yt_service = AsyncMock()
        mock_yt_config = YoutubeStreamConfigWithID(
            stream_key=FAKE_STREAM_KEY, broadcast_key=FAKE_BROADCAST_KEY, stream_id=FAKE_STREAM_ID
        )
        mock_yt_service.setup_livestream.return_value = mock_yt_config
        mock_yt_service.validate_stream_status.return_value = True
        mock_yt_service_class.return_value = mock_yt_service
        mock_camera_request = AsyncMock(
            return_value=Response(
                HTTP_OK,
                json={
                    "url": YOUTUBE_STREAM_URL,
                    "mode": "youtube",
                    "started_at": "2026-02-26T10:00:00Z",
                    "metadata": {"camera_properties": {}, "capture_metadata": {}},
                },
            )
        )
        mock_build_camera_request.return_value = mock_camera_request

        redis_mock = AsyncMock()

        user_mock = build_user()
        http_client = AsyncMock()
        camera_id = require_uuid(mock_camera.id)

        result = await start_recording(
            camera_id=camera_id,
            session=session_mock,
            http_client=http_client,
            redis=redis_mock,
            current_user=user_mock,
            product_id=1,
            title="Test",
            description="Test Desc",
            privacy_status=YouTubePrivacyStatus.PRIVATE,
        )
        assert str(result.url) == f"{YOUTUBE_STREAM_URL}/"
        mock_yt_service_class.assert_called_once_with(
            oauth_account,
            google_youtube_oauth_client,
            session_mock,
            http_client,
        )
        redis_mock.set.assert_awaited_once()
        cache_key, payload = redis_mock.set.await_args.args[:2]
        assert cache_key == f"rpi_cam:youtube_recording:{camera_id}"
        cached_session = json.loads(payload)
        assert cached_session["product_id"] == 1
        assert cached_session["title"] == "Test"
        assert cached_session["description"] == "Test Desc"
        assert cached_session["stream_url"] == f"{YOUTUBE_STREAM_URL}/"
        assert cached_session["broadcast_key"] == FAKE_BROADCAST_KEY
        assert "camera_properties" in cached_session["video_metadata"]
        assert "capture_metadata" in cached_session["video_metadata"]

    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.get_user_owned_camera")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.build_camera_request")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.YouTubeService")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.create_video", new_callable=AsyncMock)
    async def test_stop_recording(
        self,
        mock_create_video: AsyncMock,
        mock_yt_service_class: MagicMock,
        mock_build_camera_request: MagicMock,
        mock_get_cam: MagicMock,
        mock_camera: Camera,
    ) -> None:
        """Test stopping an active YouTube recording."""
        mock_get_cam.return_value = mock_camera
        redis_mock = AsyncMock()
        redis_mock.get.return_value = json.dumps(
            {
                "product_id": 1,
                "title": "Test",
                "description": "Test Desc",
                "stream_url": f"{YOUTUBE_STREAM_URL}/",
                "broadcast_key": FAKE_BROADCAST_KEY,
                "video_metadata": {"camera_properties": {}, "capture_metadata": {}},
            }
        )
        mock_yt_service = AsyncMock()
        mock_yt_service.end_livestream.return_value = None
        mock_yt_service_class.return_value = mock_yt_service
        mock_camera_request = AsyncMock(return_value=Response(HTTP_NO_CONTENT))
        mock_build_camera_request.return_value = mock_camera_request
        mock_create_video.return_value = Video(
            id=1,
            url=YOUTUBE_STREAM_URL,
            title="Test",
            description="Test Desc",
            product_id=1,
            video_metadata={"camera_properties": {}, "capture_metadata": {}},
        )

        session_mock = AsyncMock()
        oauth_account = OAuthAccount(
            id=uuid4(),
            user_id=uuid4(),
            oauth_name="google",
            access_token=FAKE_ACCESS_TOKEN,
            expires_at=None,
            refresh_token=None,
            account_id=FAKE_ACCOUNT_ID,
            account_email=FAKE_ACCOUNT_EMAIL,
        )
        session_mock.scalar.return_value = oauth_account
        user_mock = build_user()
        camera_id = require_uuid(mock_camera.id)
        http_client = AsyncMock()

        result = await stop_recording(
            camera_id=camera_id,
            session=session_mock,
            http_client=http_client,
            redis=redis_mock,
            current_user=user_mock,
        )
        assert str(result.url) == YOUTUBE_STREAM_URL
        assert result.product_id == 1
        mock_yt_service.end_livestream.assert_awaited_once_with(FAKE_BROADCAST_KEY)
        mock_create_video.assert_awaited_once()
        await_args = mock_create_video.await_args
        assert await_args is not None
        _, created_video = await_args.args
        assert created_video.product_id == 1
        assert str(created_video.url) == f"{YOUTUBE_STREAM_URL}/"
        assert created_video.title == "Test"
        assert created_video.description == "Test Desc"
        assert created_video.video_metadata == {"camera_properties": {}, "capture_metadata": {}}
        redis_mock.delete.assert_awaited_once_with(f"rpi_cam:youtube_recording:{camera_id}")

    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.get_user_owned_camera")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.build_camera_request")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.YouTubeService")
    async def test_get_recording_monitor_stream(
        self,
        mock_yt_service_class: MagicMock,
        mock_build_camera_request: MagicMock,
        mock_get_cam: MagicMock,
        mock_camera: Camera,
    ) -> None:
        """Test fetching the YouTube monitor stream configuration for an active recording."""
        mock_get_cam.return_value = mock_camera

        session_mock = AsyncMock()
        oauth_account = OAuthAccount(
            id=uuid4(),
            user_id=uuid4(),
            oauth_name="google",
            access_token=FAKE_ACCESS_TOKEN,
            expires_at=None,
            refresh_token=None,
            account_id=FAKE_ACCOUNT_ID,
            account_email=FAKE_ACCOUNT_EMAIL,
        )
        session_mock.scalar.return_value = oauth_account

        mock_yt_service = AsyncMock()
        monitor_stream = YouTubeMonitorStreamResponse(
            enableMonitorStream=True,
            broadcastStreamDelayMs=0,
            embedHtml="<iframe />",
        )
        mock_yt_service.get_broadcast_monitor_stream.return_value = monitor_stream
        mock_yt_service_class.return_value = mock_yt_service
        mock_camera_request = AsyncMock(
            return_value=Response(
                HTTP_OK,
                json={
                    "url": YOUTUBE_STREAM_URL,
                    "mode": "youtube",
                    "started_at": "2026-02-26T10:00:00Z",
                    "youtube_config": {
                        "stream_key": FAKE_STREAM_KEY,
                        "broadcast_key": FAKE_BROADCAST_KEY,
                    },
                    "metadata": {"camera_properties": {}, "capture_metadata": {}},
                },
            )
        )
        mock_build_camera_request.return_value = mock_camera_request

        user_mock = build_user()
        http_client = AsyncMock()
        camera_id = require_uuid(mock_camera.id)

        result = await get_recording_monitor_stream(camera_id, session_mock, http_client, user_mock)
        assert result == monitor_stream
        mock_yt_service.get_broadcast_monitor_stream.assert_awaited_once_with(FAKE_BROADCAST_KEY)

