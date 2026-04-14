"""Camera interaction services."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Any, cast
from uuid import UUID

from httpx import AsyncClient, HTTPStatusError, RequestError, Response
from pydantic import UUID4, AnyUrl, BaseModel, Field, PositiveInt, SecretStr, ValidationError
from relab_rpi_cam_models.images import ImageCaptureStatus
from relab_rpi_cam_models.telemetry import TelemetrySnapshot
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.models import OAuthAccount
from app.api.common.crud.query import require_model
from app.api.common.exceptions import APIError
from app.api.common.schemas.base import serialize_datetime_with_z
from app.api.data_collection.models.product import Product
from app.api.file_storage.models import Image
from app.api.plugins.rpi_cam.constants import HttpMethod
from app.api.plugins.rpi_cam.exceptions import (
    GoogleOAuthAssociationRequiredError,
    InvalidCameraResponseError,
    InvalidRecordingSessionDataError,
    RecordingSessionNotFoundError,
    RecordingSessionStoreError,
)
from app.api.plugins.rpi_cam.models import CameraConnectionStatus, CameraStatus
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
from app.api.plugins.rpi_cam.websocket.protocol import RelayResponse
from app.core.logging import sanitize_log_value
from app.core.redis import delete_redis_key, get_redis_value, set_redis_value

# ── Redis Connection Tracking ──────────────────────────────────────────────────


def get_camera_online_cache_key(camera_id: UUID4) -> str:
    """Get the Redis key for tracking camera online status."""
    return f"rpi_cam:online:{camera_id}"


def get_camera_last_seen_cache_key(camera_id: UUID4) -> str:
    """Get the Redis key for tracking when the camera was last seen."""
    return f"rpi_cam:last_seen:{camera_id}"


async def mark_camera_online(redis_client: Redis, camera_id: UUID4, ttl: int = 30) -> None:
    """Mark a camera as online in Redis, updating its last seen timestamp."""
    now = serialize_datetime_with_z(datetime.now(UTC))
    await set_redis_value(redis_client, get_camera_online_cache_key(camera_id), "1", ex=ttl)
    await set_redis_value(redis_client, get_camera_last_seen_cache_key(camera_id), now)


async def mark_camera_offline(redis_client: Redis, camera_id: UUID4) -> None:
    """Remove a camera's online status in Redis."""
    await delete_redis_key(redis_client, get_camera_online_cache_key(camera_id))


async def get_camera_status(redis_client: Redis | None, camera_id: UUID4) -> CameraStatus:
    """Fetch connection status globally from Redis cache."""
    if not redis_client:
        return CameraStatus(connection=CameraConnectionStatus.OFFLINE)

    pipeline = redis_client.pipeline()
    pipeline.get(get_camera_online_cache_key(camera_id))
    pipeline.get(get_camera_last_seen_cache_key(camera_id))
    online, last_seen_str = await pipeline.execute()

    conn = CameraConnectionStatus.ONLINE if online else CameraConnectionStatus.OFFLINE
    last_seen = datetime.fromisoformat(last_seen_str) if last_seen_str else None
    return CameraStatus(connection=conn, last_seen_at=last_seen)


# ── Telemetry cache ────────────────────────────────────────────────────────────
# ``TelemetrySnapshot`` and ``ThermalState`` live in ``.telemetry`` so the
# ``schemas`` package can import them without triggering the
# ``services <-> schemas.streaming`` cycle. Re-exported here for callers that
# grab them off ``services``.


TELEMETRY_CACHE_PREFIX = "rpi_cam:telemetry"
# 120s TTL covers a 5s poll cadence (mosaic dashboard) with plenty of headroom
# against network blips — if the mosaic is open the value gets refreshed well
# before expiry; if it isn't, we don't mind stale data aging out.
TELEMETRY_CACHE_TTL_SECONDS = 120


def get_telemetry_cache_key(camera_id: UUID4) -> str:
    """Build the Redis key holding a camera's last-known telemetry snapshot."""
    return f"{TELEMETRY_CACHE_PREFIX}:{camera_id}"


async def store_telemetry(
    redis_client: Redis,
    camera_id: UUID4,
    snapshot: TelemetrySnapshot,
) -> None:
    """Cache a telemetry snapshot fetched from the Pi."""
    await set_redis_value(
        redis_client,
        get_telemetry_cache_key(camera_id),
        snapshot.model_dump_json(),
        ex=TELEMETRY_CACHE_TTL_SECONDS,
    )


async def get_cached_telemetry(
    redis_client: Redis | None,
    camera_id: UUID4,
) -> TelemetrySnapshot | None:
    """Return the most recent cached telemetry snapshot, or ``None`` on miss."""
    if not redis_client:
        return None
    payload = await get_redis_value(redis_client, get_telemetry_cache_key(camera_id))
    if payload is None:
        return None
    try:
        return TelemetrySnapshot.model_validate_json(payload)
    except ValidationError:
        logger.warning("Discarding malformed cached telemetry for camera %s", sanitize_log_value(camera_id))
        return None


# ── Last-image-per-camera query for the mosaic dashboard ──────────────────────


async def get_last_image_url_per_camera(
    session: AsyncSession,
    camera_ids: list[UUID4],
) -> dict[UUID, str | None]:
    """Return the most recent captured image URL for each camera in one query.

    The ``Image`` model doesn't have a dedicated ``camera_id`` column — images
    belong to products, not cameras. ``receive_camera_upload`` stamps the
    capturing camera's id into ``Image.image_metadata['camera_id']`` at upload
    time so this query can do a single ``DISTINCT ON`` over the JSONB path
    and return ``{uuid: url}`` without N+1 fan-out. For the ≤15-cameras
    scale an index isn't load-bearing; add a GIN index on
    ``image_metadata`` → ``camera_id`` later if the cost ever shows up.
    """
    if not camera_ids:
        return {}

    # Lazy import to avoid circular-import issues — ``ImageRead`` pulls in
    # FastAPI/Pydantic plumbing that can't be loaded at module-import time
    # in some test configurations.
    from app.api.file_storage.schemas import ImageRead  # noqa: PLC0415

    camera_id_strings = [str(camera_id) for camera_id in camera_ids]
    camera_id_expr = Image.image_metadata["camera_id"].astext

    stmt = (
        select(Image)
        .where(camera_id_expr.in_(camera_id_strings))
        .order_by(camera_id_expr, Image.created_at.desc())
        .distinct(camera_id_expr)
    )
    result = await session.execute(stmt)
    rows = result.scalars().all()

    urls: dict[UUID, str | None] = dict.fromkeys(camera_ids)
    for image in rows:
        stored_camera_id = (image.image_metadata or {}).get("camera_id")
        if not stored_camera_id:
            continue
        try:
            camera_uuid = UUID(stored_camera_id)
        except ValueError:
            continue
        if camera_uuid not in urls:
            continue
        image_read = ImageRead.model_validate(image)
        urls[camera_uuid] = image_read.image_url
    return urls


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
    *,
    camera_request: Callable[..., Awaitable[Response | RelayResponse]],
    product_id: PositiveInt,
    filename: str | None = None,
    description: str | None = None,
) -> Image:
    """Trigger a capture on the Pi and return the resulting stored ``Image``.

    The Pi handles the heavy lifting: capture → synchronous push back to the
    backend's upload endpoint → stored via the image storage service. This
    function only needs to tell the Pi what parent association to use, wait
    for the Pi's confirmation, and then fetch the stored row.
    """
    # Validate the product_id upfront so we fail fast.
    await require_model(session, Product, product_id)

    upload_metadata: dict[str, Any] = {"product_id": int(product_id)}
    if description is not None:
        upload_metadata["description"] = description
    if filename is not None:
        upload_metadata["filename"] = filename

    capture_response = await camera_request(
        endpoint="/images",
        method=HttpMethod.POST,
        body={"upload_metadata": upload_metadata},
        error_msg="Failed to capture image",
    )
    try:
        capture_data = cast("dict[str, Any]", capture_response.json())
    except json.JSONDecodeError as e:
        body_preview = getattr(capture_response, "content", b"")[:200]
        logger.exception(
            "Camera returned non-JSON response for POST /images (%d bytes): %r",
            len(getattr(capture_response, "content", b"")),
            body_preview,
        )
        raise InvalidCameraResponseError(
            details=f"Expected JSON, got {len(body_preview)} bytes: {body_preview!r}",
        ) from e

    status_value = str(capture_data.get("status") or ImageCaptureStatus.UPLOADED)
    if status_value == ImageCaptureStatus.QUEUED:
        raise InvalidCameraResponseError(
            details=(
                "Camera captured the image but the synchronous push to the backend failed; "
                "it was queued on the device for retry. Please try again."
            ),
        )
    if status_value != ImageCaptureStatus.UPLOADED:
        raise InvalidCameraResponseError(
            details=f"Camera returned an unknown capture status: {status_value!r}",
        )

    image_id_hex = capture_data.get("image_id")
    if not isinstance(image_id_hex, str):
        raise InvalidCameraResponseError(
            details=f"Camera response missing image_id: {capture_data!r}",
        )
    try:
        image_uuid = UUID(hex=image_id_hex)
    except ValueError as exc:
        raise InvalidCameraResponseError(
            details=f"Camera returned malformed image_id: {image_id_hex!r}",
        ) from exc

    image = await session.get(Image, image_uuid)
    if image is None:
        raise InvalidCameraResponseError(
            details=(
                f"Camera reported a successful upload but image {image_id_hex} was not found "
                "in the backend database — upload may have been written to a different session."
            ),
        )
    return image


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
