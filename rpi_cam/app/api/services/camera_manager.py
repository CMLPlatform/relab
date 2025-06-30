"""Main camera manager service class."""

import asyncio
import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from urllib.parse import urljoin

from picamera2 import Picamera2
from picamera2.encoders import H264Encoder
from pydantic import AnyUrl

from app.api.models.camera import CameraMode, CameraStatusView
from app.api.models.images import ImageCaptureResponse, ImageMetadata
from app.api.models.stream import (
    Stream,
    StreamMode,
    StreamView,
    YoutubeConfigRequiredError,
    YoutubeStreamConfig,
)
from app.core.config import settings
from app.utils.files import clear_directory


class YouTubeValidationError(Exception):
    """Raised when YouTube stream key validation fails."""

    def __init__(self, stream_key: str | None = None) -> None:
        super().__init__(f"Invalid YouTube stream key{f': {stream_key}' if stream_key else ''}.")


class ActiveStreamError(Exception):
    """Raised when trying to access the camera while a stream is active."""

    def __init__(self, stream: Stream) -> None:
        self.mode = stream.mode
        self.url = stream.url
        super().__init__(f"Stream active in {self.mode} mode at {self.url}. Stop streaming first.")


class CameraManager:
    """Main camera manager class which handles camera setup, streaming, and cleanup."""

    def __init__(self) -> None:
        self.camera: Picamera2 | None = None
        self.current_mode: CameraMode | None = None
        self.stream = Stream()
        self.lock = asyncio.Lock()
        self.lock_timeout = 10

    @asynccontextmanager
    async def _camera_lock(self) -> AsyncGenerator[None]:
        """Context manager for camera lock with timeout."""
        try:
            await asyncio.wait_for(self.lock.acquire(), timeout=self.lock_timeout)
            yield
        except TimeoutError as e:
            err_msg = f"Failed to acquire camera lock - timeout error: {e}"
            raise RuntimeError(err_msg) from e
        finally:
            if self.lock.locked():
                self.lock.release()

    async def _setup_camera(self, mode: CameraMode) -> Picamera2:
        """Setup camera for specific mode."""
        if self.stream.is_active and mode == CameraMode.PHOTO:
            raise ActiveStreamError(self.stream)

        async with self._camera_lock():
            if self.camera is None:
                # Create camera instance if it doesn't exist
                self.camera = await asyncio.to_thread(Picamera2)
            elif self.current_mode == mode:
                # Camera already set up for this mode
                return self.camera
            else:
                # Stop camera if it's running before switching modes
                await asyncio.to_thread(self.camera.stop)

            config = mode.get_config(self.camera)
            self.camera.configure(config)
            await asyncio.to_thread(self.camera.start)
            self.current_mode = mode
            return self.camera

    async def capture_jpeg(self) -> ImageCaptureResponse:
        """Capture image and return JPEG bytes."""
        camera = await self._setup_camera(CameraMode.PHOTO)
        async with self._camera_lock():
            # Capture image
            pil_image = await asyncio.to_thread(camera.capture_image)

            # Capture metadata
            if (capture_metadata := await asyncio.to_thread(camera.capture_metadata)) is None:
                err_msg = "Failed to capture image metadata"
                raise RuntimeError(err_msg)
            img_metadata = ImageMetadata.from_metadata(pil_image, camera.camera_properties, capture_metadata)

            # Save image to local file
            image_id = uuid.uuid4().hex
            image_path = settings.image_path / f"{image_id}.jpg"
            await asyncio.to_thread(pil_image.save, image_path, exif=img_metadata.to_exif(), format="JPEG", quality=90)

            expires_at = datetime.fromtimestamp(datetime.now(UTC).timestamp() + settings.image_ttl_s, tz=UTC)

        return ImageCaptureResponse(
            image_id=image_id,
            image_url=AnyUrl(urljoin(str(settings.base_url), f"/images/{image_id}")),
            metadata=img_metadata,
            expires_at=expires_at,
        )

    async def start_streaming(
        self, mode: StreamMode, *, youtube_config: YoutubeStreamConfig | None = None
    ) -> StreamView:
        """Start streaming to YouTube or local file."""
        if mode == StreamMode.YOUTUBE:
            if not youtube_config:
                raise YoutubeConfigRequiredError
            if not await youtube_config.validate_stream_key():
                raise YouTubeValidationError(youtube_config.stream_key)

        if self.stream.is_active:
            raise ActiveStreamError(self.stream)

        camera = await self._setup_camera(CameraMode.VIDEO)

        async with self._camera_lock():
            try:
                self.stream._encoder = H264Encoder()
                self.stream._output = await mode.get_ffmpeg_output(youtube_config)
                await asyncio.to_thread(camera.start_recording, self.stream._encoder, self.stream._output)
                self.stream.mode = mode
                self.stream.url = mode.get_url(youtube_config)
                self.stream.started_at = datetime.now(UTC) - timedelta(seconds=5)
                self.stream.youtube_config = youtube_config

            # TODO: Improve error handling here
            except Exception as e:
                self.stream._encoder = None
                self.stream._output = None
                err_msg = f"Failed to start streaming: {e}"
                raise RuntimeError(err_msg) from e

        if (stream_info := await self.get_stream_info()) is None:
            err_msg = "Failed to get stream information"
            raise RuntimeError(err_msg)

        return stream_info

    async def stop_streaming(self) -> None:
        """Stop streaming to YouTube or local file."""
        async with self._camera_lock():
            if self.stream.is_active and self.camera:
                await asyncio.to_thread(self.camera.stop_recording)
                if self.stream.mode == StreamMode.LOCAL:
                    await clear_directory(settings.hls_path, time_to_live_s=settings.hls_ttl_s)
                self.stream = Stream()  # Reset stream state
            else:
                err_msg = "No stream active"
                raise RuntimeError(err_msg)

    async def cleanup(self, *, force: bool = False) -> None:
        """Clean up camera and streaming resources. If force is True, this happens even if there is an active stream."""
        if self.stream.is_active and not force:
            raise ActiveStreamError(self.stream)

        if self.stream.is_active:
            await self.stop_streaming()

        await clear_directory(settings.image_path, time_to_live_s=settings.hls_ttl_s)

        async with self._camera_lock():
            if self.camera:
                await asyncio.to_thread(self.camera.stop)
                await asyncio.to_thread(self.camera.close)
                self.camera = None
                self.current_mode = None

    async def get_stream_info(self) -> StreamView | None:
        """Get stream information including metadata if active."""
        if self.camera and self.stream.is_active:
            if (capture_metadata := await asyncio.to_thread(self.camera.capture_metadata)) is None:
                err_msg = "Failed to capture image metadata"
                raise RuntimeError(err_msg)
            return self.stream._get_info(
                camera_properties=self.camera.camera_properties, capture_metadata=capture_metadata
            )
        # Return empty stream view if no stream is active
        return None

    async def get_status(self) -> CameraStatusView:
        stream_info = await self.get_stream_info()
        return CameraStatusView(current_mode=self.current_mode, stream=stream_info if self.stream.is_active else None)
