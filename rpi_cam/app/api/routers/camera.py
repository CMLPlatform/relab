"""Router for camera management endpoints."""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.api.dependencies.camera_management import CameraManagerDependency
from app.api.models.camera import CameraMode, CameraStatusView
from app.api.services.camera_manager import ActiveStreamError

router = APIRouter(prefix="/camera", tags=["camera"])


@router.post("/open")
async def open_camera(
    camera_manager: CameraManagerDependency,
    mode: Annotated[CameraMode, Query(description="Camera mode to open (photo or video)")] = CameraMode.PHOTO,
) -> CameraStatusView:
    """Manually open camera in photo or video mode."""
    await camera_manager._setup_camera(mode)
    return await camera_manager.get_status()


@router.get("/status")
async def get_camera_status(
    camera_manager: CameraManagerDependency,
) -> CameraStatusView:
    """Get camera status."""
    return await camera_manager.get_status()


@router.post("/close")
async def close_camera(
    camera_manager: CameraManagerDependency,
) -> CameraStatusView:
    """Manually disconnect from camera hardware and clean up camera resources."""
    try:
        await camera_manager.cleanup()
        return await camera_manager.get_status()
    except ActiveStreamError as e:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot close camera while streaming in {e.mode} mode at {e.url}. Stop streaming first.",
        ) from e
