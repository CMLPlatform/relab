"""Models for Camera information and management logic."""

from enum import Enum

from picamera2 import Picamera2
from pydantic import BaseModel

from app.api.models.stream import StreamView


class CameraMode(str, Enum):
    """Camera use mode. Contains camera configuration for each mode."""

    PHOTO = "photo"
    VIDEO = "video"

    def get_config(self, camera: Picamera2) -> dict:
        """Get camera configuration for this mode."""
        match self:
            case CameraMode.PHOTO:
                return camera.create_still_configuration(main={"size": (1920, 1080)}, raw=None)
            case CameraMode.VIDEO:
                return camera.create_video_configuration(raw=None)  # Defaults to 720p, 30fps


class CameraStatusView(BaseModel):
    """API response model for camera status."""

    current_mode: CameraMode | None = None
    stream: StreamView | None = None
