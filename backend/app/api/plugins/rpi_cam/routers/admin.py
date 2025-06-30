"""Routers for the Raspberry Pi Camera plugin."""

from collections.abc import Sequence

from fastapi import APIRouter, Depends
from pydantic import UUID4

from app.api.auth.dependencies import current_active_superuser
from app.api.common.crud.base import get_model_by_id, get_models
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.plugins.rpi_cam import crud
from app.api.plugins.rpi_cam.dependencies import CameraFilterWithOwnerDep
from app.api.plugins.rpi_cam.models import Camera, CameraStatus
from app.api.plugins.rpi_cam.schemas import CameraRead

### Camera admin router ###

# TODO: Also make file and data-collection routers user-dependent and add admin routers for superusers
# TODO: write and implement generic get user_owned model dependency classes

router = APIRouter(
    prefix="/admin/plugins/rpi-cam/cameras",
    tags=["admin"],
    dependencies=[Depends(current_active_superuser)],
)


## GET ##
@router.get(
    "",
    response_model=list[CameraRead],
    summary="Get all Raspberry Pi cameras",
)
async def get_all_cameras(
    session: AsyncSessionDep,
    camera_filter: CameraFilterWithOwnerDep,
) -> Sequence[Camera]:
    """Get all Raspberry Pi cameras."""
    return await get_models(session, Camera, model_filter=camera_filter)


@router.get("/{camera_id}", summary="Get Raspberry Pi camera by ID", response_model=CameraRead)
async def get_camera(camera_id: UUID4, session: AsyncSessionDep) -> Camera:
    """Get single Raspberry Pi camera by ID."""
    db_camera = await get_model_by_id(session, Camera, camera_id)
    # TODO: Can we deduplicate these standard translations of exceptions to HTTP exceptions across the codebase?

    return db_camera


@router.get("/{camera_id}/status", summary="Get Raspberry Pi camera online status")
async def get_camera_status(camera_id: UUID4, session: AsyncSessionDep) -> CameraStatus:
    """Get Raspberry Pi camera online status."""
    db_camera = await get_model_by_id(session, Camera, camera_id)

    return await db_camera.get_status()


## DELETE
@router.delete("/{camera_id}", summary="Delete Raspberry Pi camera", status_code=204)
async def delete_camera(
    camera_id: UUID4,
    session: AsyncSessionDep,
) -> None:
    """Delete Raspberry Pi camera."""
    await crud.force_delete_camera(session, camera_id)
