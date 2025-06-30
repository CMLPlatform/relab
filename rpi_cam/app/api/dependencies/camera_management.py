"""Camera management dependencies for FastAPI."""

import logging
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends
from fastapi_utils.tasks import repeat_every

from app.api.services.camera_manager import CameraManager
from app.core.config import settings

camera_manager = CameraManager()

logger = logging.getLogger(__name__)


def get_camera_manager() -> CameraManager:
    """Fetch the camera manager singleton."""
    return camera_manager


CameraManagerDependency = Annotated[CameraManager, Depends(get_camera_manager)]


@repeat_every(seconds=settings.camera_standby_s)
async def camera_to_standby() -> None:
    """Close camera instance if there is no active stream."""
    if not camera_manager.stream.is_active:
        await camera_manager.cleanup()


@repeat_every(seconds=60)  # Check every minute
async def check_stream_duration() -> None:
    """Stop streams that exceed maximum duration."""
    if (
        camera_manager.stream.is_active
        and camera_manager.stream.started_at
        and (datetime.now(UTC) - camera_manager.stream.started_at).total_seconds() > settings.max_stream_duration_s
    ):
        try:
            await camera_manager.stop_streaming()
        except RuntimeError as e:
            logger.exception("Failed to stop stream when exceeding max duration", exc_info=e)
