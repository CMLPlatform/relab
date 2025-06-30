"""Models for Stream information."""

from enum import Enum
from urllib.parse import urljoin

import httpx
from picamera2.encoders import H264Encoder
from picamera2.outputs import FfmpegOutput
from pydantic import AnyUrl, BaseModel, Field, PastDatetime, PositiveFloat

from app.api.models.images import BaseMetadata, CameraProperties, CaptureMetadata
from app.core.config import settings


### Custom Exceptions ###
class YoutubeConfigRequiredError(Exception):
    """Raised when trying to start a YouTube stream without providing a YouTube config."""

    def __init__(self) -> None:
        super().__init__("Broadcast and stream key required for YouTube streaming.")


class StreamStateError(Exception):
    """Raised when stream state is inconsistent."""

    def __init__(self, msg: str | None = None) -> None:
        super().__init__(msg or "Stream state is inconsistent.")


### Pydantic Models ###
class YoutubeStreamConfig(BaseModel):
    """YouTube stream configuration."""

    stream_key: str = Field(description="Stream key for YouTube streaming")
    broadcast_key: str = Field(description="Broadcast key for YouTube streaming")

    async def validate_stream_key(self) -> bool:
        """Validate stream key by checking if the upload URL is valid."""
        url_str = str(self.get_upload_url())
        async with httpx.AsyncClient() as client:
            response = await client.post(url_str)
            return response.status_code == 202

    def get_upload_url(self) -> AnyUrl:
        """Get YouTube HLS upload URL pointing to the stream key."""
        return AnyUrl(
            f"https://a.upload.youtube.com/http_upload_hls?cid={self.stream_key}&copy=0&file={settings.hls_manifest_filename}"
        )

    def get_broadcast_url(self) -> AnyUrl:
        """Get YouTube broadcast URL."""
        return AnyUrl(f"https://youtube.com/watch?v={self.broadcast_key}")


class StreamMode(str, Enum):
    """Stream mode. Contains ffmpeg stream and URL construction logic for each mode."""

    YOUTUBE = "youtube"
    LOCAL = "local"

    async def get_ffmpeg_output(self, youtube_config: YoutubeStreamConfig | None = None) -> FfmpegOutput:
        """Create FfmpegOutput object for this streaming mode."""
        base_output = (
            "-g 30 -sc_threshold 0 "  # Closed GOP and disabled scene detection
            "-b:v 2500k -maxrate 2500k "  # Limit bitrate to 2500 kb/s
            "-f hls "
            "-hls_time 2 -hls_list_size 5 "  # 5 segments, 2s each
            "-hls_segment_type mpegts "  # MPEG-TS segments
            "-hls_flags delete_segments+independent_segments "
            "-http_persistent 1 "
        )

        match self:
            case StreamMode.YOUTUBE:
                if not youtube_config:
                    raise YoutubeConfigRequiredError

                output_str = base_output + (
                    f"-master_pl_name {settings.hls_manifest_filename} "  # Create a master playlist
                    "-method POST "  # Required by YouTube
                    f"{youtube_config.get_upload_url()}"  # Upload URL
                )
                return FfmpegOutput(
                    output_str,
                    audio=True,  # Youtube requires audio
                    audio_bitrate=8000,
                    # HACK: Using a PulseAudio null source to avoid feedback. The built-in '-f lavfi -i anullsrc` option
                    # is preferred but PiCamera2 FfmpegOutput only accepts pulse devices.
                    audio_device="nullaudio.monitor",
                )

            case StreamMode.LOCAL:
                output_str = base_output + str(settings.hls_path / settings.hls_manifest_filename)
                return FfmpegOutput(output_str)

    def get_url(self, youtube_config: YoutubeStreamConfig | None = None) -> AnyUrl:
        """Get stream URL for this mode."""
        match self:
            case StreamMode.YOUTUBE:
                if not youtube_config:
                    raise YoutubeConfigRequiredError
                return youtube_config.get_broadcast_url()

            case StreamMode.LOCAL:
                return AnyUrl(urljoin(str(settings.base_url), "/stream/watch"))


class StreamMetadata(BaseMetadata):
    """Metadata specific to video streams."""

    @property
    def fps(self) -> PositiveFloat | None:
        """Frames per second calculated from frame duration."""
        if self.capture_metadata.frame_duration:
            return round(1_000_000 / self.capture_metadata.frame_duration, 3)
        return None

    @classmethod
    def from_metadata(cls, camera_properties: dict, capture_metadata: dict) -> "StreamMetadata":
        return cls(
            camera_properties=CameraProperties.model_validate(camera_properties),
            capture_metadata=CaptureMetadata.model_validate(capture_metadata),
        )


class StreamView(BaseModel):
    """Pydantic model for active stream information."""

    mode: StreamMode
    url: AnyUrl
    started_at: PastDatetime
    youtube_config: YoutubeStreamConfig | None = None
    metadata: StreamMetadata


class Stream:
    """Main Stream model."""

    mode: StreamMode | None = None
    url: AnyUrl | None = None
    started_at: PastDatetime | None = None
    youtube_config: YoutubeStreamConfig | None = None

    # FFMPEG configuration
    _encoder: H264Encoder | None = None
    _output: FfmpegOutput | None = None

    @property
    def is_active(self) -> bool:
        return self.mode is not None

    def _get_info(self, camera_properties: dict, capture_metadata: dict) -> StreamView | None:
        """Get stream information including metadata if active.

        Depends on camera properties and capture metadata.
        """
        if not self.is_active:
            return None

        metadata = StreamMetadata.from_metadata(camera_properties, capture_metadata)

        # Validate stream state consistency
        if self.mode is None:
            raise StreamStateError(msg="Stream mode is None but stream is marked as active")
        if self.url is None:
            raise StreamStateError(msg="Stream URL is None but stream is marked as active")
        if self.started_at is None:
            raise StreamStateError(msg="Stream start time is None but stream is marked as active")

        return StreamView(
            mode=self.mode,
            url=self.url,
            metadata=metadata,
            started_at=self.started_at,
            youtube_config=self.youtube_config,
        )
