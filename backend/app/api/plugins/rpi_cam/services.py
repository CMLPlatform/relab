"""Camera interaction services."""

from datetime import UTC, datetime
from enum import Enum
from io import BytesIO

from fastapi import UploadFile
from fastapi.datastructures import Headers
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import Resource, build
from googleapiclient.errors import HttpError
from httpx_oauth.clients.google import GoogleOAuth2
from pydantic import Field, PositiveInt
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.auth.config import settings
from app.api.auth.models import OAuthAccount
from app.api.auth.services.oauth import GOOGLE_YOUTUBE_SCOPES
from app.api.common.crud.utils import db_get_model_with_id_if_it_exists
from app.api.common.exceptions import APIError
from app.api.common.schemas.base import serialize_datetime_with_z
from app.api.data_collection.models import Product
from app.api.file_storage.crud import create_image
from app.api.file_storage.models.models import Image, ImageParentType
from app.api.file_storage.schemas import ImageCreateInternal
from app.api.plugins.rpi_cam.models import Camera, YoutubeStreamConfig
from app.api.plugins.rpi_cam.routers.camera_interaction.utils import HttpMethod, fetch_from_camera_url


async def capture_and_store_image(
    session: AsyncSession,
    camera: Camera,
    *,
    product_id: PositiveInt,
    filename: str | None = None,
    description: str | None = None,
) -> Image:
    """Capture image from camera and store in database. Optionally associate with a parent product."""
    # Validate the product_id
    if product_id:
        await db_get_model_with_id_if_it_exists(session, Product, product_id)

    # Capture image
    capture_response = await fetch_from_camera_url(
        camera=camera,
        endpoint="/images",
        method=HttpMethod.POST,
        error_msg="Failed to capture image",
    )
    capture_data = capture_response.json()

    # Download image
    image_response = await fetch_from_camera_url(
        camera=camera,
        endpoint=capture_data["image_url"],
        method=HttpMethod.GET,
        error_msg="Failed to download image",
    )

    # Create image data and store in database
    timestamp_str = capture_data.get("metadata", {}).get("image_properties", {}).get("capture_time")
    image_data = ImageCreateInternal(
        file=UploadFile(
            file=BytesIO(image_response.content),
            filename=filename if filename else f"{camera.name}_{serialize_datetime_with_z(datetime.now(UTC))}.jpg",
            size=len(image_response.content),
            headers=Headers({"content-type": "image/jpeg"}),
        ),
        description=(description if description else f"Captured from camera {camera.name} at {timestamp_str}."),
        image_metadata=capture_data.get("metadata"),
        parent_type=ImageParentType.PRODUCT,
        parent_id=product_id,
    )

    return await create_image(session, image_data)


### Youtube API ###
class YouTubeAPIError(APIError):
    """Custom exception for YouTube API errors."""

    def __init__(self, http_status_code: int = 500, details: str | None = None):
        self.http_status_code = http_status_code
        super().__init__("YouTube API error.", details)


class YouTubePrivacyStatus(str, Enum):
    """Enumeration of YouTube privacy statuses."""

    PUBLIC = "public"
    PRIVATE = "private"
    UNLISTED = "unlisted"


class YoutubeStreamConfigWithID(YoutubeStreamConfig):
    """YouTube stream configuration with ID for stream status validation."""

    stream_id: str = Field(description="liveStream ID. Only used for stream status validation.")


class YouTubeService:
    """YouTube API service for creating and managing live streams."""

    def __init__(self, oauth_account: OAuthAccount, google_oauth_client: GoogleOAuth2):
        self.oauth_account = oauth_account
        self.google_oauth_client = google_oauth_client

    async def refresh_token_if_needed(self) -> None:
        """Refresh OAuth token if expired."""
        if self.oauth_account.expires_at and self.oauth_account.expires_at < datetime.now(UTC).timestamp():
            # TODO: if Refresh token is None, what to do? https://medium.com/starthinker/google-oauth-2-0-access-token-and-refresh-token-explained-cccf2fc0a6d9
            new_token = await self.google_oauth_client.refresh_token(self.oauth_account.refresh_token)
            self.oauth_account.access_token = new_token["access_token"]
            self.oauth_account.expires_at = datetime.now(UTC).timestamp() + new_token["expires_in"]

    def get_youtube_client(self) -> Resource:
        """Get authenticated YouTube API client."""
        # TODO: Make Google API client thread safe and async if possible (using asyncio/asyncer): https://github.com/googleapis/google-api-python-client/blob/main/docs/thread_safety.md
        credentials = Credentials(
            token=self.oauth_account.access_token,
            refresh_token=self.oauth_account.refresh_token,
            token_uri="https://oauth2.googleapis.com/token",  # noqa: S106 # No sensitive data in URL
            client_id=settings.google_oauth_client_id,
            client_secret=settings.google_oauth_client_secret,
            scopes=GOOGLE_YOUTUBE_SCOPES,
        )
        return build("youtube", "v3", credentials=credentials)

    async def setup_livestream(
        self,
        title: str,
        privacy_status: YouTubePrivacyStatus = YouTubePrivacyStatus.PRIVATE,
        description: str | None = None,
    ) -> YoutubeStreamConfigWithID:
        """Create a YouTube livestream and return stream configuration."""
        await self.refresh_token_if_needed()
        youtube = self.get_youtube_client()

        try:
            # Create broadcast
            broadcast = (
                youtube.liveBroadcasts()
                .insert(
                    part="snippet,status,contentDetails",
                    body={
                        "snippet": {
                            "title": title,
                            "scheduledStartTime": serialize_datetime_with_z(datetime.now(UTC)),
                            "description": description or "",
                        },
                        "status": {"privacyStatus": privacy_status.value, "selfDeclaredMadeForKids": False},
                        "contentDetails": {  # Enable auto start and stop of broadcast on stream start and stop
                            # TODO: Investigate potential pause function, which would require manual start/stop
                            "enableAutoStart": True,
                            "enableAutoStop": True,
                        },
                    },
                )
                .execute()
            )

            # Create stream
            # TODO: Create one stream per camera and store key and id in camera model
            stream = (
                youtube.liveStreams()
                .insert(
                    part="snippet,cdn",
                    body={
                        "snippet": {"title": title},
                        "cdn": {"frameRate": "30fps", "ingestionType": "hls", "resolution": "720p"},
                        "description": description or "",
                    },
                )
                .execute()
            )

            # Bind them together
            broadcast = (
                youtube.liveBroadcasts()
                .bind(id=broadcast["id"], part="id,contentDetails", streamId=stream["id"])
                .execute()
            )

            return YoutubeStreamConfigWithID(
                stream_key=stream["cdn"]["ingestionInfo"]["streamName"],
                broadcast_key=broadcast["id"],
                stream_id=stream["id"],
            )

        except HttpError as e:
            raise YouTubeAPIError(http_status_code=e.status_code, details=f"Failed to create livestream: {e}") from e

    async def validate_stream_status(self, stream_id: str) -> bool:
        """Check if a YouTube livestream is live."""
        await self.refresh_token_if_needed()
        youtube = self.get_youtube_client()

        try:
            response = youtube.liveStreams().list(part="status", id=stream_id).execute()
            return response["items"][0]["status"]["streamStatus"] in ("active", "ready")
        except HttpError as e:
            raise YouTubeAPIError(http_status_code=e.status_code, details=f"Failed to validate livestream: {e}") from e
        except KeyError as e:
            raise YouTubeAPIError(details=f"Failed to validate livestream: {e}") from e

    async def end_livestream(self, broadcast_key: str) -> None:
        """End a YouTube livestream."""
        await self.refresh_token_if_needed()
        youtube = self.get_youtube_client()

        try:
            youtube.liveBroadcasts().delete(id=broadcast_key).execute()
        except HttpError as e:
            raise YouTubeAPIError(http_status_code=e.status_code, details=f"Failed to end livestream: {e}") from e
