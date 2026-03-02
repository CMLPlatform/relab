"""Unit tests for RPi Cam stream routers."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import Request
from httpx import Response

from app.api.auth.models import OAuthAccount, User
from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.routers.camera_interaction.streams import (
    YouTubePrivacyStatus,
    get_camera_stream_status,
    hls_file_proxy,
    start_preview,
    start_recording,
    stop_all_streams,
    stop_preview,
    stop_recording,
    watch_preview,
)
from app.api.plugins.rpi_cam.services import YoutubeStreamConfigWithID

# Constants for test values
TEST_EMAIL = "test@example.com"
TEST_HASHED_PASSWORD = "hashed_password"  # noqa: S105
TEST_CAMERA_NAME = "Test Camera"
TEST_CAMERA_DESC = "A test camera"
TEST_STREAM_URL = "http://stream.url"
TEST_PLAYLIST_FILE = "playlist.m3u8"
YOUTUBE_STREAM_URL = "http://youtube.stream"
PREVIEW_STREAM_URL = "http://preview.stream"
FAKE_ACCESS_TOKEN = "test"  # noqa: S105
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


@pytest.fixture
def mock_user() -> User:
    """Return a mock user for testing."""
    return User(
        id=uuid4(),
        email=TEST_EMAIL,
        is_active=True,
        is_verified=True,
        hashed_password=TEST_HASHED_PASSWORD,
    )


@pytest.fixture
def mock_camera(mock_user: User) -> Camera:
    """Return a mock camera for testing."""
    return Camera(
        id=uuid4(),
        name=TEST_CAMERA_NAME,
        description=TEST_CAMERA_DESC,
        url="http://localhost:8000",
        encrypted_api_key="encrypted_key",
        owner_id=mock_user.id,
    )


class TestCameraStreamRouters:
    """Test suite for camera streaming router endpoints."""

    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.get_user_owned_camera")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.fetch_from_camera_url")
    async def test_get_camera_stream_status_success(
        self, mock_fetch: MagicMock, mock_get_cam: MagicMock, mock_camera: Camera
    ) -> None:
        """Test retrieving the current streaming status of a camera."""
        mock_get_cam.return_value = mock_camera
        mock_fetch.return_value = Response(
            HTTP_OK,
            json={
                "url": TEST_STREAM_URL,
                "mode": "youtube",
                "started_at": "2026-02-26T10:00:00Z",
                "metadata": {"camera_properties": {}, "capture_metadata": {}},
            },
        )

        session_mock = AsyncMock()
        user_mock = User(id=uuid4(), email=TEST_EMAIL, is_active=True, hashed_password=TEST_HASHED_PASSWORD)

        result = await get_camera_stream_status(mock_camera.id, session_mock, user_mock)
        assert str(result.url) == f"{TEST_STREAM_URL}/"

    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.get_user_owned_camera")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.fetch_from_camera_url")
    async def test_stop_all_streams(self, mock_fetch: MagicMock, mock_get_cam: MagicMock, mock_camera: Camera) -> None:
        """Test stopping all active streams for a camera."""
        mock_get_cam.return_value = mock_camera
        mock_fetch.return_value = Response(HTTP_NO_CONTENT)

        session_mock = AsyncMock()
        user_mock = User(id=uuid4(), email=TEST_EMAIL, is_active=True, hashed_password=TEST_HASHED_PASSWORD)

        await stop_all_streams(mock_camera.id, session_mock, user_mock)
        mock_fetch.assert_called_once()

    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.get_user_owned_camera")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.fetch_from_camera_url")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.YouTubeService")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.db_get_model_with_id_if_it_exists")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.create_video")
    async def test_start_recording(
        self,
        mock_create_video: MagicMock,
        mock_db_check: MagicMock,
        mock_yt_service_class: MagicMock,
        mock_fetch: MagicMock,
        mock_get_cam: MagicMock,
        mock_camera: Camera,
    ) -> None:
        """Test initiating a recording/livestream to YouTube."""
        del mock_db_check
        mock_get_cam.return_value = mock_camera
        mock_fetch.return_value = Response(
            HTTP_OK,
            json={
                "url": YOUTUBE_STREAM_URL,
                "mode": "youtube",
                "started_at": "2026-02-26T10:00:00Z",
                "metadata": {"camera_properties": {}, "capture_metadata": {}},
            },
        )

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

        mock_create_video.return_value = VIDEO_CREATED_MSG

        user_mock = User(id=uuid4(), email=TEST_EMAIL, is_active=True, hashed_password=TEST_HASHED_PASSWORD)

        result = await start_recording(
            mock_camera.id,
            session_mock,
            user_mock,
            product_id=1,
            title="Test",
            description="Test Desc",
            privacy_status=YouTubePrivacyStatus.PRIVATE,
        )
        assert result == VIDEO_CREATED_MSG

    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.get_user_owned_camera")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.fetch_from_camera_url")
    async def test_stop_recording(self, mock_fetch: MagicMock, mock_get_cam: MagicMock, mock_camera: Camera) -> None:
        """Test stopping an active YouTube recording."""
        mock_get_cam.return_value = mock_camera
        # Two fetches: one GET for status, one DELETE to stop
        mock_fetch.side_effect = [
            Response(
                HTTP_OK,
                json={
                    "url": YOUTUBE_STREAM_URL,
                    "mode": "youtube",
                    "started_at": "2026-02-26T10:00:00Z",
                    "metadata": {"camera_properties": {}, "capture_metadata": {}},
                },
            ),
            Response(HTTP_NO_CONTENT),
        ]

        session_mock = AsyncMock()
        user_mock = User(id=uuid4(), email=TEST_EMAIL, is_active=True, hashed_password=TEST_HASHED_PASSWORD)

        result = await stop_recording(mock_camera.id, session_mock, user_mock)
        assert str(result["video_url"]) == f"{YOUTUBE_STREAM_URL}/"

    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.get_user_owned_camera")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.fetch_from_camera_url")
    async def test_start_preview(self, mock_fetch: MagicMock, mock_get_cam: MagicMock, mock_camera: Camera) -> None:
        """Test starting a local preview stream."""
        mock_get_cam.return_value = mock_camera
        mock_fetch.return_value = Response(
            HTTP_OK,
            json={
                "url": PREVIEW_STREAM_URL,
                "mode": "local",
                "started_at": "2026-02-26T10:00:00Z",
                "metadata": {"camera_properties": {}, "capture_metadata": {}},
            },
        )

        session_mock = AsyncMock()
        user_mock = User(id=uuid4(), email=TEST_EMAIL, is_active=True, hashed_password=TEST_HASHED_PASSWORD)

        result = await start_preview(mock_camera.id, session_mock, user_mock)
        assert str(result.url) == f"{PREVIEW_STREAM_URL}/"

    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.get_user_owned_camera")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.fetch_from_camera_url")
    async def test_stop_preview(self, mock_fetch: MagicMock, mock_get_cam: MagicMock, mock_camera: Camera) -> None:
        """Test stopping the local preview stream."""
        mock_get_cam.return_value = mock_camera
        mock_fetch.return_value = Response(HTTP_NO_CONTENT)

        session_mock = AsyncMock()
        user_mock = User(id=uuid4(), email=TEST_EMAIL, is_active=True, hashed_password=TEST_HASHED_PASSWORD)

        await stop_preview(mock_camera.id, session_mock, user_mock)
        mock_fetch.assert_called_once()

    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.get_user_owned_camera")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.fetch_from_camera_url")
    async def test_hls_file_proxy(self, mock_fetch: MagicMock, mock_get_cam: MagicMock, mock_camera: Camera) -> None:
        """Test proxying HLS files from the camera to the client."""
        mock_get_cam.return_value = mock_camera
        mock_fetch.return_value = Response(
            HTTP_OK, content=HLS_DATA_CONTENT, headers={"content-type": "application/vnd.apple.mpegurl"}
        )

        session_mock = AsyncMock()
        user_mock = User(id=uuid4(), email=TEST_EMAIL, is_active=True, hashed_password=TEST_HASHED_PASSWORD)

        result = await hls_file_proxy(mock_camera.id, TEST_PLAYLIST_FILE, session_mock, user_mock)
        assert result.status_code == HTTP_OK
        assert result.body == HLS_DATA_CONTENT

    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.get_user_owned_camera")
    @patch("app.api.plugins.rpi_cam.routers.camera_interaction.streams.templates")
    async def test_watch_preview(
        self, mock_templates: MagicMock, mock_get_cam: MagicMock, mock_camera: Camera
    ) -> None:
        """Test rendering the preview watch page."""
        mock_get_cam.return_value = mock_camera
        mock_templates.TemplateResponse.return_value = TEMPLATE_HTML_CONTENT

        session_mock = AsyncMock()
        user_mock = User(id=uuid4(), email=TEST_EMAIL, is_active=True, hashed_password=TEST_HASHED_PASSWORD)
        request_mock = AsyncMock(spec=Request)

        result = await watch_preview(request_mock, mock_camera.id, session_mock, user_mock)
        assert result == TEMPLATE_HTML_CONTENT
