"""Unit tests for YouTube recording orchestration service behavior."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from httpx import Response

from app.api.auth.exceptions import UserOwnershipError
from app.api.auth.models import OAuthAccount
from app.api.common.exceptions import ServiceUnavailableError
from app.api.data_collection.models.product import Product
from app.api.file_storage.models import Video
from app.api.plugins.rpi_cam.constants import PLUGIN_STREAM_ENDPOINT
from app.api.plugins.rpi_cam.exceptions import RecordingSessionStoreError
from app.api.plugins.rpi_cam.runtime.recording import YouTubeRecordingSession
from app.api.plugins.rpi_cam.schemas.youtube import YouTubeMonitorStreamResponse
from app.api.plugins.rpi_cam.services.recording_service import (
    get_youtube_recording_monitor_stream,
    start_youtube_recording,
    stop_youtube_recording,
)
from app.api.plugins.rpi_cam.services.youtube import YouTubePrivacyStatus
from tests.unit.plugins.rpi_cam.stream_router_test_support import (
    FAKE_ACCESS_TOKEN,
    FAKE_ACCOUNT_EMAIL,
    FAKE_ACCOUNT_ID,
    FAKE_BROADCAST_KEY,
    HTTP_OK,
    YOUTUBE_STREAM_URL,
    build_stream_config,
    build_user,
    require_uuid,
)

if TYPE_CHECKING:
    from app.api.plugins.rpi_cam.models import Camera


def build_oauth_account() -> OAuthAccount:
    """Return a typed OAuth account for recording service tests."""
    return OAuthAccount(
        id=uuid4(),
        user_id=uuid4(),
        oauth_name="google",
        access_token=FAKE_ACCESS_TOKEN,
        expires_at=None,
        refresh_token=None,
        account_id=FAKE_ACCOUNT_ID,
        account_email=FAKE_ACCOUNT_EMAIL,
    )


def build_video(*, video_id: int = 42) -> Video:
    """Return a persisted-video-shaped model for recording service tests."""
    return Video(
        id=video_id,
        url=YOUTUBE_STREAM_URL,
        title="Test",
        description="Test Desc",
        product_id=1,
        video_metadata={"camera_properties": {}, "capture_metadata": {}},
    )


def build_recording_session(*, video_id: int = 42) -> YouTubeRecordingSession:
    """Return an active recording session."""
    return YouTubeRecordingSession(video_id=video_id, broadcast_key=FAKE_BROADCAST_KEY)


@patch("app.api.plugins.rpi_cam.services.recording_service.get_user_owned_camera")
@patch("app.api.plugins.rpi_cam.services.recording_service.build_camera_request")
@patch("app.api.plugins.rpi_cam.services.recording_service.YouTubeService")
@patch("app.api.plugins.rpi_cam.services.recording_service.get_user_owned_object")
@patch("app.api.plugins.rpi_cam.services.recording_service.create_video", new_callable=AsyncMock)
async def test_start_youtube_recording_creates_video_and_stores_session_video_id(
    mock_create_video: AsyncMock,
    mock_product_ownership: MagicMock,
    mock_yt_service_class: MagicMock,
    mock_build_camera_request: MagicMock,
    mock_get_cam: MagicMock,
    mock_camera: Camera,
) -> None:
    """Starting recording should create the product video immediately and cache its ID."""
    del mock_product_ownership
    mock_get_cam.return_value = mock_camera
    mock_create_video.return_value = build_video(video_id=42)

    session_mock = AsyncMock()
    session_mock.scalar.return_value = build_oauth_account()
    session_mock.get.return_value = None
    session_mock.add = MagicMock()

    mock_yt_service = AsyncMock()
    mock_yt_service.setup_livestream.return_value = build_stream_config()
    mock_yt_service.validate_stream_status.return_value = True
    mock_yt_service_class.return_value = mock_yt_service
    mock_camera_request = AsyncMock(
        return_value=Response(
            HTTP_OK,
            json={
                "url": YOUTUBE_STREAM_URL,
                "mode": "youtube",
                "provider": "youtube",
                "started_at": "2026-02-26T10:00:00Z",
                "metadata": {"camera_properties": {}, "capture_metadata": {}},
            },
        )
    )
    mock_build_camera_request.return_value = mock_camera_request

    redis_mock = AsyncMock()
    redis_mock.get.return_value = None
    camera_id = require_uuid(mock_camera.id)

    result = await start_youtube_recording(
        camera_id=camera_id,
        session=session_mock,
        http_client=AsyncMock(),
        redis=redis_mock,
        current_user=build_user(),
        product_id=1,
        title="Test",
        description="Test Desc",
        privacy_status=YouTubePrivacyStatus.PRIVATE,
    )

    assert str(result.url) == f"{YOUTUBE_STREAM_URL}/"
    mock_create_video.assert_awaited_once()
    redis_mock.set.assert_awaited_once()
    cache_key, payload = redis_mock.set.await_args.args[:2]
    assert cache_key == f"rpi_cam:youtube_recording:{camera_id}"
    cached_session = YouTubeRecordingSession.model_validate_json(payload)
    assert cached_session == build_recording_session(video_id=42)


@patch("app.api.plugins.rpi_cam.services.recording_service.get_user_owned_camera")
@patch("app.api.plugins.rpi_cam.services.recording_service.YouTubeService")
@patch("app.api.plugins.rpi_cam.services.recording_service.get_user_owned_object")
@patch("app.api.plugins.rpi_cam.services.recording_service.create_video", new_callable=AsyncMock)
async def test_start_youtube_recording_rejects_product_not_owned_by_camera_owner(
    mock_create_video: AsyncMock,
    mock_get_owned_product: MagicMock,
    mock_yt_service_class: MagicMock,
    mock_get_cam: MagicMock,
    mock_camera: Camera,
) -> None:
    """Recording may only attach videos to products owned by the camera owner."""
    user_mock = build_user()
    foreign_product_id = 1
    mock_get_cam.return_value = mock_camera
    mock_get_owned_product.side_effect = UserOwnershipError(Product, foreign_product_id, require_uuid(user_mock.id))

    session_mock = AsyncMock()
    session_mock.get.return_value = None
    redis_mock = AsyncMock()
    redis_mock.get.return_value = None

    with pytest.raises(UserOwnershipError):
        await start_youtube_recording(
            camera_id=require_uuid(mock_camera.id),
            session=session_mock,
            http_client=AsyncMock(),
            redis=redis_mock,
            current_user=user_mock,
            product_id=foreign_product_id,
            title="Test",
            description="Test Desc",
            privacy_status=YouTubePrivacyStatus.PRIVATE,
        )

    mock_yt_service_class.assert_not_called()
    mock_create_video.assert_not_awaited()


@patch("app.api.plugins.rpi_cam.services.recording_service.get_user_owned_camera")
@patch("app.api.plugins.rpi_cam.services.recording_service.build_camera_request")
@patch("app.api.plugins.rpi_cam.services.recording_service.YouTubeService")
@patch("app.api.plugins.rpi_cam.services.recording_service.get_user_owned_object")
@patch("app.api.plugins.rpi_cam.services.recording_service.create_video", new_callable=AsyncMock)
async def test_start_youtube_recording_is_idempotent_when_session_already_active(
    mock_create_video: AsyncMock,
    mock_product_ownership: MagicMock,
    mock_yt_service_class: MagicMock,
    mock_build_camera_request: MagicMock,
    mock_get_cam: MagicMock,
    mock_camera: Camera,
) -> None:
    """A start retry should return the live stream view without creating another video."""
    del mock_product_ownership
    mock_get_cam.return_value = mock_camera
    redis_mock = AsyncMock()
    redis_mock.get.return_value = build_recording_session().model_dump_json()
    mock_camera_request = AsyncMock(
        return_value=Response(
            HTTP_OK,
            json={
                "url": YOUTUBE_STREAM_URL,
                "mode": "youtube",
                "provider": "youtube",
                "started_at": "2026-02-26T10:00:00Z",
                "metadata": {"camera_properties": {}, "capture_metadata": {}},
            },
        )
    )
    mock_build_camera_request.return_value = mock_camera_request

    result = await start_youtube_recording(
        camera_id=require_uuid(mock_camera.id),
        session=AsyncMock(),
        http_client=AsyncMock(),
        redis=redis_mock,
        current_user=build_user(),
        product_id=1,
        title="Test",
        description="Test Desc",
        privacy_status=YouTubePrivacyStatus.PRIVATE,
    )

    assert str(result.url) == f"{YOUTUBE_STREAM_URL}/"
    mock_yt_service_class.assert_not_called()
    mock_create_video.assert_not_awaited()
    redis_mock.set.assert_not_awaited()


@patch("app.api.plugins.rpi_cam.services.recording_service.get_user_owned_camera")
@patch("app.api.plugins.rpi_cam.services.recording_service.build_camera_request")
@patch("app.api.plugins.rpi_cam.services.recording_service.YouTubeService")
@patch("app.api.plugins.rpi_cam.services.recording_service.get_user_owned_object")
@patch("app.api.plugins.rpi_cam.services.recording_service.store_recording_session", new_callable=AsyncMock)
@patch("app.api.plugins.rpi_cam.services.recording_service.delete_video", new_callable=AsyncMock)
@patch("app.api.plugins.rpi_cam.services.recording_service.create_video", new_callable=AsyncMock)
async def test_start_youtube_recording_rolls_back_created_video_when_session_storage_fails(
    mock_create_video: AsyncMock,
    mock_delete_video: AsyncMock,
    mock_store_recording_session: AsyncMock,
    mock_product_ownership: MagicMock,
    mock_yt_service_class: MagicMock,
    mock_build_camera_request: MagicMock,
    mock_get_cam: MagicMock,
    mock_camera: Camera,
) -> None:
    """A session storage failure should clean up Pi, YouTube, and the new video row."""
    del mock_product_ownership
    mock_get_cam.return_value = mock_camera
    mock_create_video.return_value = build_video(video_id=42)

    session_mock = AsyncMock()
    session_mock.scalar.return_value = build_oauth_account()
    session_mock.get.return_value = None
    session_mock.add = MagicMock()
    mock_store_recording_session.side_effect = RecordingSessionStoreError()

    mock_yt_service = AsyncMock()
    mock_yt_service.setup_livestream.return_value = build_stream_config()
    mock_yt_service.validate_stream_status.return_value = True
    mock_yt_service_class.return_value = mock_yt_service
    mock_build_camera_request.return_value = AsyncMock(
        return_value=Response(
            HTTP_OK,
            json={
                "url": YOUTUBE_STREAM_URL,
                "mode": "youtube",
                "provider": "youtube",
                "started_at": "2026-02-26T10:00:00Z",
                "metadata": {"camera_properties": {}, "capture_metadata": {}},
            },
        )
    )
    redis_mock = AsyncMock()
    redis_mock.get.return_value = None

    with pytest.raises(RecordingSessionStoreError):
        await start_youtube_recording(
            camera_id=require_uuid(mock_camera.id),
            session=session_mock,
            http_client=AsyncMock(),
            redis=redis_mock,
            current_user=build_user(),
            product_id=1,
            title="Test",
            description="Test Desc",
            privacy_status=YouTubePrivacyStatus.PRIVATE,
        )

    mock_delete_video.assert_awaited_once_with(session_mock, 42)
    mock_yt_service.end_livestream.assert_awaited_once_with(FAKE_BROADCAST_KEY)


@patch("app.api.plugins.rpi_cam.services.recording_service.get_user_owned_camera")
@patch("app.api.plugins.rpi_cam.services.recording_service.build_camera_request")
@patch("app.api.plugins.rpi_cam.services.recording_service.YouTubeService")
@patch("app.api.plugins.rpi_cam.services.recording_service.require_model", new_callable=AsyncMock)
async def test_stop_youtube_recording_returns_existing_video_and_tolerates_camera_cleanup_failure(
    mock_require_model: AsyncMock,
    mock_yt_service_class: MagicMock,
    mock_build_camera_request: MagicMock,
    mock_get_cam: MagicMock,
    mock_camera: Camera,
) -> None:
    """A Pi outage must not prevent YouTube teardown, session clearing, or returning the started video."""
    mock_get_cam.return_value = mock_camera
    mock_require_model.return_value = build_video(video_id=42)
    redis_mock = AsyncMock()
    redis_mock.get.return_value = build_recording_session(video_id=42).model_dump_json()
    call_order: list[str] = []

    async def _camera_request(**kwargs: object) -> Response:
        call_order.append(str(kwargs.get("endpoint")))
        error_message = "camera offline"
        raise ServiceUnavailableError(error_message)

    async def _end_livestream(*_args: object, **_kwargs: object) -> None:
        call_order.append("youtube_end")

    mock_yt_service = AsyncMock()
    mock_yt_service.end_livestream.side_effect = _end_livestream
    mock_yt_service_class.return_value = mock_yt_service
    mock_build_camera_request.return_value = _camera_request

    session_mock = AsyncMock()
    session_mock.scalar.return_value = build_oauth_account()

    result = await stop_youtube_recording(
        camera_id=require_uuid(mock_camera.id),
        session=session_mock,
        http_client=AsyncMock(),
        redis=redis_mock,
        current_user=build_user(),
    )

    assert call_order == ["youtube_end", PLUGIN_STREAM_ENDPOINT]
    assert result.id == 42
    assert result.product_id == 1
    mock_require_model.assert_awaited_once_with(session_mock, Video, 42)
    mock_yt_service.end_livestream.assert_awaited_once_with(FAKE_BROADCAST_KEY)
    redis_mock.delete.assert_awaited_once()


@patch("app.api.plugins.rpi_cam.services.recording_service.get_user_owned_camera")
@patch("app.api.plugins.rpi_cam.services.recording_service.build_camera_request")
@patch("app.api.plugins.rpi_cam.services.recording_service.YouTubeService")
async def test_get_youtube_recording_monitor_stream(
    mock_yt_service_class: MagicMock,
    mock_build_camera_request: MagicMock,
    mock_get_cam: MagicMock,
    mock_camera: Camera,
) -> None:
    """Fetching the monitor stream should delegate to YouTubeService."""
    mock_get_cam.return_value = mock_camera
    monitor_stream = YouTubeMonitorStreamResponse(
        enableMonitorStream=True,
        broadcastStreamDelayMs=0,
        embedHtml="<iframe />",
    )
    mock_yt_service = AsyncMock()
    mock_yt_service.get_broadcast_monitor_stream.return_value = monitor_stream
    mock_yt_service_class.return_value = mock_yt_service
    mock_build_camera_request.return_value = AsyncMock(
        return_value=Response(
            HTTP_OK,
            json={
                "url": YOUTUBE_STREAM_URL,
                "mode": "youtube",
                "started_at": "2026-02-26T10:00:00Z",
                "provider": "youtube",
                "metadata": {"camera_properties": {}, "capture_metadata": {}},
            },
        )
    )
    redis_mock = AsyncMock()
    redis_mock.get.return_value = build_recording_session(video_id=42).model_dump_json()

    result = await get_youtube_recording_monitor_stream(
        camera_id=require_uuid(mock_camera.id),
        session=AsyncMock(),
        http_client=AsyncMock(),
        redis=redis_mock,
        current_user=build_user(),
    )

    assert result == monitor_stream
