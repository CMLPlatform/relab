"""Camera interaction services."""

from __future__ import annotations

import asyncio
import logging
import secrets
from datetime import UTC, datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Any

from httpx import AsyncClient, HTTPStatusError, RequestError, Response
from pydantic import Field, SecretStr, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.models import OAuthAccount
from app.api.common.exceptions import APIError
from app.api.common.schemas.base import serialize_datetime_with_z
from app.api.plugins.rpi_cam.exceptions import GoogleOAuthAssociationRequiredError
from app.api.plugins.rpi_cam.schemas.streaming import YoutubeStreamConfig
from app.api.plugins.rpi_cam.schemas.youtube import (
    YouTubeAPIErrorResponse,
    YouTubeBroadcastContentDetailsCreate,
    YouTubeBroadcastCreateRequest,
    YouTubeBroadcastListResponse,
    YouTubeBroadcastResponse,
    YouTubeBroadcastStatusCreate,
    YouTubeMonitorStreamResponse,
    YouTubeSnippetCreate,
    YouTubeStreamCDNCreate,
    YouTubeStreamCreateRequest,
    YouTubeStreamListResponse,
    YouTubeStreamResponse,
)
from app.api.plugins.rpi_cam.service_runtime import (
    TELEMETRY_CACHE_PREFIX,
    TELEMETRY_CACHE_TTL_SECONDS,
    YOUTUBE_RECORDING_SESSION_CACHE_PREFIX,
    YOUTUBE_RECORDING_SESSION_TTL_SECONDS,
    LastCameraImageUrls,
    YouTubeRecordingSession,
    build_recording_text,
    capture_and_store_image,
    clear_recording_session,
    get_cached_telemetry,
    get_camera_last_seen_cache_key,
    get_camera_online_cache_key,
    get_camera_status,
    get_last_image_urls_per_camera,
    get_preview_thumbnail_urls_per_camera,
    get_recording_session_cache_key,
    get_telemetry_cache_key,
    load_recording_session,
    mark_camera_offline,
    mark_camera_online,
    serialize_stream_metadata,
    store_recording_session,
    store_telemetry,
)

if TYPE_CHECKING:
    from httpx_oauth.clients.google import GoogleOAuth2


logger = logging.getLogger(__name__)
YOUTUBE_API_BASE_URL = "https://www.googleapis.com/youtube/v3"

# Retry schedule for transient YouTube API failures. Each entry is the base delay
# in seconds; jitter is added by ``_jittered_backoff_s``. Total worst-case wait is
# ~3.75 s + jitter across 3 attempts (initial + 2 retries). Retryable statuses are
# 429 / 5xx and any network-layer error; 4xx responses never retry.
_YOUTUBE_RETRY_BACKOFF_S: tuple[float, ...] = (0.25, 1.0)
_YOUTUBE_RETRYABLE_STATUSES: frozenset[int] = frozenset({429, 500, 502, 503, 504})


def _jittered_backoff_s(base: float) -> float:
    """Return ``base`` with up to 25% additive jitter from ``secrets.SystemRandom``."""
    jitter = secrets.SystemRandom().random() * 0.25
    return base * (1.0 + jitter)


class YouTubeAPIError(APIError):
    """Custom exception for YouTube API errors."""

    def __init__(self, http_status_code: int = 500, details: str | None = None):
        self.http_status_code = http_status_code
        super().__init__("YouTube API error.", details)


class YouTubePrivacyStatus(StrEnum):
    """Enumeration of YouTube privacy statuses."""

    PUBLIC = "public"
    PRIVATE = "private"
    UNLISTED = "unlisted"


class YoutubeStreamConfigWithID(YoutubeStreamConfig):
    """YouTube stream configuration with ID for stream status validation."""

    stream_id: str = Field(description="liveStream ID. Only used for stream status validation.")


class YouTubeService:
    """YouTube API service for creating and managing live streams."""

    def __init__(
        self,
        oauth_account: OAuthAccount,
        google_oauth_client: GoogleOAuth2,
        session: AsyncSession,
        http_client: AsyncClient,
    ) -> None:
        self.oauth_account = oauth_account
        self.google_oauth_client = google_oauth_client
        self.session = session
        self.http_client = http_client

    async def refresh_token_if_needed(self) -> None:
        """Refresh OAuth token if expired and persist to database."""
        if self.oauth_account.expires_at and self.oauth_account.expires_at < datetime.now(UTC).timestamp():
            if not self.oauth_account.refresh_token:
                raise GoogleOAuthAssociationRequiredError from None

            new_token = await self.google_oauth_client.refresh_token(self.oauth_account.refresh_token)
            self.oauth_account.access_token = new_token["access_token"]
            self.oauth_account.expires_at = datetime.now(UTC).timestamp() + new_token["expires_in"]

            self.session.add(self.oauth_account)
            await self.session.commit()
            await self.session.refresh(self.oauth_account)

    async def request_youtube_api(
        self,
        method: str,
        endpoint: str,
        *,
        params: dict[str, str] | None = None,
        body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Send an authenticated request to the YouTube Data API with retries."""
        total_attempts = len(_YOUTUBE_RETRY_BACKOFF_S) + 1
        for attempt in range(total_attempts):
            if attempt:
                await asyncio.sleep(_jittered_backoff_s(_YOUTUBE_RETRY_BACKOFF_S[attempt - 1]))
            try:
                response = await self.http_client.request(
                    method,
                    f"{YOUTUBE_API_BASE_URL}/{endpoint}",
                    params=params,
                    json=body,
                    headers={"Authorization": f"Bearer {self.oauth_account.access_token}"},
                )
                response.raise_for_status()
            except HTTPStatusError as e:
                status = e.response.status_code
                error = YouTubeAPIError(
                    http_status_code=status,
                    details=self._build_error_detail(endpoint, e.response),
                )
                if status in _YOUTUBE_RETRYABLE_STATUSES and attempt < total_attempts - 1:
                    logger.warning(
                        "YouTube API %s %s returned %d; retrying (%d/%d)",
                        method,
                        endpoint,
                        status,
                        attempt + 2,
                        total_attempts,
                    )
                    continue
                raise error from e
            except RequestError as e:
                if attempt < total_attempts - 1:
                    logger.warning(
                        "YouTube API %s %s network error; retrying (%d/%d): %s",
                        method,
                        endpoint,
                        attempt + 2,
                        total_attempts,
                        e,
                    )
                    continue
                raise YouTubeAPIError(
                    http_status_code=503,
                    details=f"Network error contacting YouTube API: {e}",
                ) from e

            if response.status_code == 204:
                return {}
            return response.json()

        msg = f"YouTube API {method} {endpoint} exhausted retries without a terminal outcome"
        raise RuntimeError(msg)

    @staticmethod
    def _build_error_detail(endpoint: str, response: Response) -> str:
        """Build a useful error message from a failed YouTube API response."""
        try:
            error_payload = YouTubeAPIErrorResponse.model_validate(response.json())
            error_message = error_payload.error.message if error_payload.error else None
        except ValueError:
            error_message = response.text
        except ValidationError:
            error_message = response.text

        if error_message:
            return f"Failed calling {endpoint}: {error_message}"
        return f"Failed calling {endpoint}: HTTP {response.status_code}"

    async def setup_livestream(
        self,
        title: str,
        privacy_status: YouTubePrivacyStatus = YouTubePrivacyStatus.PRIVATE,
        description: str | None = None,
    ) -> YoutubeStreamConfigWithID:
        """Create a YouTube livestream and return stream configuration."""
        await self.refresh_token_if_needed()
        broadcast_payload = YouTubeBroadcastCreateRequest(
            snippet=YouTubeSnippetCreate(
                title=title,
                scheduledStartTime=serialize_datetime_with_z(datetime.now(UTC)),
                description=description or "",
            ),
            status=YouTubeBroadcastStatusCreate(privacyStatus=privacy_status.value),
            contentDetails=YouTubeBroadcastContentDetailsCreate(),
        )
        broadcast = await self.request_youtube_api(
            "POST",
            "liveBroadcasts",
            params={"part": "snippet,status,contentDetails"},
            body=broadcast_payload.model_dump(mode="json"),
        )
        try:
            broadcast_response = YouTubeBroadcastResponse.model_validate(broadcast)
        except ValidationError as e:
            raise YouTubeAPIError(details=f"Invalid YouTube broadcast response: {e}") from e

        stream_payload = YouTubeStreamCreateRequest(
            snippet=YouTubeSnippetCreate(title=title, description=description or ""),
            cdn=YouTubeStreamCDNCreate(),
            description=description or "",
        )
        stream = await self.request_youtube_api(
            "POST",
            "liveStreams",
            params={"part": "snippet,cdn"},
            body=stream_payload.model_dump(mode="json"),
        )
        try:
            stream_response = YouTubeStreamResponse.model_validate(stream)
        except ValidationError as e:
            raise YouTubeAPIError(details=f"Invalid YouTube stream response: {e}") from e

        broadcast = await self.request_youtube_api(
            "POST",
            "liveBroadcasts/bind",
            params={"id": broadcast_response.id, "part": "id,contentDetails", "streamId": stream_response.id},
        )
        try:
            bound_broadcast_response = YouTubeBroadcastResponse.model_validate(broadcast)
        except ValidationError as e:
            raise YouTubeAPIError(details=f"Invalid YouTube bind response: {e}") from e

        return YoutubeStreamConfigWithID(
            stream_key=SecretStr(stream_response.cdn.ingestionInfo.streamName),
            broadcast_key=SecretStr(bound_broadcast_response.id),
            stream_id=stream_response.id,
        )

    async def validate_stream_status(self, stream_id: str) -> bool:
        """Check if a YouTube livestream is live."""
        await self.refresh_token_if_needed()

        try:
            response = await self.request_youtube_api(
                "GET",
                "liveStreams",
                params={"part": "status", "id": stream_id},
            )
            stream_list_response = YouTubeStreamListResponse.model_validate(response)
            if not stream_list_response.items:
                raise YouTubeAPIError(details="Failed to validate livestream: stream not found.")
            return stream_list_response.items[0].status.streamStatus in ("active", "ready")
        except ValidationError as e:
            raise YouTubeAPIError(details=f"Invalid YouTube stream status response: {e}") from e

    async def end_livestream(self, broadcast_key: str) -> None:
        """End a YouTube livestream by transitioning to 'complete', preserving the recording."""
        await self.refresh_token_if_needed()
        await self.request_youtube_api(
            "POST",
            "liveBroadcasts/transition",
            params={"broadcastStatus": "complete", "id": broadcast_key, "part": "status"},
        )

    async def get_broadcast_monitor_stream(self, broadcast_key: str) -> YouTubeMonitorStreamResponse:
        """Get the monitor stream configuration for a YouTube livestream."""
        await self.refresh_token_if_needed()

        try:
            response = await self.request_youtube_api(
                "GET",
                "liveBroadcasts",
                params={"part": "contentDetails", "id": broadcast_key},
            )
            broadcast_list_response = YouTubeBroadcastListResponse.model_validate(response)
            if not broadcast_list_response.items:
                raise YouTubeAPIError(details="Failed to fetch livestream monitor stream: broadcast not found.")

            content_details = broadcast_list_response.items[0].contentDetails
            if content_details is None or content_details.monitorStream is None:
                raise YouTubeAPIError(
                    details="Failed to fetch livestream monitor stream: monitor stream configuration missing."
                )
        except ValidationError as e:
            raise YouTubeAPIError(details=f"Invalid YouTube broadcast response: {e}") from e
        else:
            return content_details.monitorStream


__all__ = [
    "TELEMETRY_CACHE_PREFIX",
    "TELEMETRY_CACHE_TTL_SECONDS",
    "YOUTUBE_API_BASE_URL",
    "YOUTUBE_RECORDING_SESSION_CACHE_PREFIX",
    "YOUTUBE_RECORDING_SESSION_TTL_SECONDS",
    "LastCameraImageUrls",
    "YouTubeAPIError",
    "YouTubePrivacyStatus",
    "YouTubeRecordingSession",
    "YouTubeService",
    "YoutubeStreamConfigWithID",
    "build_recording_text",
    "capture_and_store_image",
    "clear_recording_session",
    "get_cached_telemetry",
    "get_camera_last_seen_cache_key",
    "get_camera_online_cache_key",
    "get_camera_status",
    "get_last_image_urls_per_camera",
    "get_preview_thumbnail_urls_per_camera",
    "get_recording_session_cache_key",
    "get_telemetry_cache_key",
    "load_recording_session",
    "mark_camera_offline",
    "mark_camera_online",
    "serialize_stream_metadata",
    "store_recording_session",
    "store_telemetry",
]
