"""Camera interaction services."""

import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from enum import StrEnum
from io import BytesIO
from typing import TYPE_CHECKING, Any, cast

from fastapi import UploadFile
from fastapi.datastructures import Headers
from httpx import AsyncClient, HTTPStatusError, RequestError, Response
from pydantic import UUID4, AnyUrl, BaseModel, Field, PositiveInt, ValidationError
from relab_rpi_cam_models.stream import YoutubeStreamConfig
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.auth.models import OAuthAccount
from app.api.common.crud.utils import get_model_or_404
from app.api.common.exceptions import APIError
from app.api.common.schemas.base import serialize_datetime_with_z
from app.api.data_collection.models.product import Product
from app.api.file_storage.crud import create_image
from app.api.file_storage.models import Image, MediaParentType
from app.api.file_storage.schemas import ImageCreateInternal
from app.api.plugins.rpi_cam.exceptions import (
    GoogleOAuthAssociationRequiredError,
    InvalidRecordingSessionDataError,
    RecordingSessionNotFoundError,
    RecordingSessionStoreError,
)
from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.routers.camera_interaction.utils import HttpMethod
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
from app.core.logging import sanitize_log_value
from app.core.redis import delete_redis_key, get_redis_value, set_redis_value

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from httpx_oauth.clients.google import GoogleOAuth2
    from redis.asyncio import Redis


logger = logging.getLogger(__name__)
YOUTUBE_API_BASE_URL = "https://www.googleapis.com/youtube/v3"
YOUTUBE_RECORDING_SESSION_CACHE_PREFIX = "rpi_cam:youtube_recording"
YOUTUBE_RECORDING_SESSION_TTL_SECONDS = 60 * 60 * 12


class YouTubeRecordingSession(BaseModel):
    """Cached state for an in-progress YouTube recording."""

    product_id: PositiveInt
    title: str
    description: str
    stream_url: AnyUrl
    broadcast_key: str
    video_metadata: dict[str, Any] | None = None


def get_recording_session_cache_key(camera_id: UUID4) -> str:
    """Build the Redis key for a camera's active YouTube recording."""
    return f"{YOUTUBE_RECORDING_SESSION_CACHE_PREFIX}:{camera_id}"


def build_recording_text(
    *,
    product_id: PositiveInt,
    title: str | None,
    description: str | None,
) -> tuple[str, str]:
    """Build the final title and description for a YouTube recording."""
    now_str = serialize_datetime_with_z(datetime.now(UTC))
    resolved_title = title or f"Product {product_id} recording at {now_str}"
    resolved_description = description or f"Recording of product {product_id} at {now_str}"
    return resolved_title, resolved_description


def serialize_stream_metadata(metadata: object | None) -> dict[str, object] | None:
    """Convert camera stream metadata into JSON-compatible data."""
    if metadata is None:
        return None
    if isinstance(metadata, BaseModel):
        return cast("dict[str, object]", metadata.model_dump(mode="json"))
    if isinstance(metadata, dict):
        return cast("dict[str, object]", metadata)
    msg = "Unsupported stream metadata type."
    raise TypeError(msg)


async def store_recording_session(
    redis_client: Redis,
    camera_id: UUID4,
    session: YouTubeRecordingSession,
) -> None:
    """Persist in-progress recording state in Redis."""
    stored = await set_redis_value(
        redis_client,
        get_recording_session_cache_key(camera_id),
        session.model_dump_json(),
        ex=YOUTUBE_RECORDING_SESSION_TTL_SECONDS,
    )
    if not stored:
        raise RecordingSessionStoreError


async def load_recording_session(redis_client: Redis, camera_id: UUID4) -> YouTubeRecordingSession:
    """Load in-progress recording state from Redis."""
    payload = await get_redis_value(redis_client, get_recording_session_cache_key(camera_id))
    if payload is None:
        raise RecordingSessionNotFoundError

    try:
        return YouTubeRecordingSession.model_validate_json(payload)
    except ValidationError as e:
        raise InvalidRecordingSessionDataError(str(e.errors())) from e


async def clear_recording_session(redis_client: Redis, camera_id: UUID4) -> None:
    """Remove in-progress recording state from Redis."""
    cleared = await delete_redis_key(redis_client, get_recording_session_cache_key(camera_id))
    if not cleared:
        logger.warning("Failed to clear YouTube recording session for camera %s", sanitize_log_value(camera_id))


async def capture_and_store_image(
    session: AsyncSession,
    camera: Camera,
    *,
    camera_request: Callable[..., Awaitable[Response]],
    product_id: PositiveInt,
    filename: str | None = None,
    description: str | None = None,
) -> Image:
    """Capture image from camera and store in database. Optionally associate with a parent product."""
    # Validate the product_id
    if product_id:
        await get_model_or_404(session, Product, product_id)

    # Capture image
    capture_response = await camera_request(
        endpoint="/images",
        method=HttpMethod.POST,
        error_msg="Failed to capture image",
    )
    capture_data = capture_response.json()

    # Download image
    image_response = await camera_request(
        endpoint=capture_data["image_url"],
        method=HttpMethod.GET,
        error_msg="Failed to download image",
    )

    # Create image data and store in database
    timestamp_str = capture_data.get("metadata", {}).get("image_properties", {}).get("capture_time")
    image_data = ImageCreateInternal(
        file=UploadFile(
            file=BytesIO(image_response.content),
            filename=filename or f"{camera.name}_{serialize_datetime_with_z(datetime.now(UTC))}.jpg",
            size=len(image_response.content),
            headers=Headers({"content-type": "image/jpeg"}),
        ),
        description=(description or f"Captured from camera {camera.name} at {timestamp_str}."),
        image_metadata=capture_data.get("metadata"),
        parent_type=MediaParentType.PRODUCT,
        parent_id=product_id,
    )

    return await create_image(session, image_data)


### Youtube API ###
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
            # Check if refresh token exists
            if not self.oauth_account.refresh_token:
                raise GoogleOAuthAssociationRequiredError from None

            # Refresh the token
            new_token = await self.google_oauth_client.refresh_token(self.oauth_account.refresh_token)

            # Update the OAuth account
            self.oauth_account.access_token = new_token["access_token"]
            self.oauth_account.expires_at = datetime.now(UTC).timestamp() + new_token["expires_in"]

            # Persist to database
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
        """Send an authenticated request to the YouTube Data API."""
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
            raise YouTubeAPIError(
                http_status_code=e.response.status_code,
                details=self._build_error_detail(endpoint, e.response),
            ) from e
        except RequestError as e:
            raise YouTubeAPIError(http_status_code=503, details=f"Network error contacting YouTube API: {e}") from e

        if response.status_code == 204:
            return {}
        return response.json()

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
        # Create broadcast
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

        # Create stream
        # NOTE: This currently creates a stream per livestream request.
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

        # Bind them together
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
            stream_key=stream_response.cdn.ingestionInfo.streamName,
            broadcast_key=bound_broadcast_response.id,
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
        """End a YouTube livestream."""
        await self.refresh_token_if_needed()
        await self.request_youtube_api("DELETE", "liveBroadcasts", params={"id": broadcast_key})

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
