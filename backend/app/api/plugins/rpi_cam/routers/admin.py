"""Routers for the Raspberry Pi Camera plugin."""

from typing import Annotated

from fastapi import APIRouter, Depends, Path
from fastapi_pagination import Page
from pydantic import UUID4

from app.api.auth.dependencies import current_active_superuser
from app.api.common.crud.base import get_paginated_models
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.plugins.rpi_cam.dependencies import CameraByIDDep, CameraFilterWithOwnerDep
from app.api.plugins.rpi_cam.models import Camera, CameraStatus
from app.api.plugins.rpi_cam.schemas import CameraRead

### Camera admin router ###


router = APIRouter(
    prefix="/admin/plugins/rpi-cam/cameras",
    tags=["admin"],
    dependencies=[Depends(current_active_superuser)],
)


## GET ##
@router.get(
    "",
    response_model=Page[CameraRead],
    summary="Get all Raspberry Pi cameras",
)
async def get_all_cameras(
    session: AsyncSessionDep,
    camera_filter: CameraFilterWithOwnerDep,
) -> Page[Camera]:
    """Get all Raspberry Pi cameras."""
    return await get_paginated_models(session, Camera, model_filter=camera_filter, read_schema=CameraRead)


@router.get("/{camera_id}", summary="Get Raspberry Pi camera by ID", response_model=CameraRead)
async def get_camera(_camera_id: Annotated[UUID4, Path(alias="camera_id")], camera: CameraByIDDep) -> Camera:
    """Get single Raspberry Pi camera by ID."""
    return camera


@router.get("/{camera_id}/status", summary="Get Raspberry Pi camera online status")
async def get_camera_status(
    _camera_id: Annotated[UUID4, Path(alias="camera_id")],
    camera: CameraByIDDep,
) -> CameraStatus:
    """Get Raspberry Pi camera online status."""
    return await camera.get_status()


## DELETE
@router.delete("/{camera_id}", summary="Delete Raspberry Pi camera", status_code=204)
async def delete_camera(
    _camera_id: Annotated[UUID4, Path(alias="camera_id")],
    session: AsyncSessionDep,
    camera: CameraByIDDep,
) -> None:
    """Delete Raspberry Pi camera."""
    await session.delete(camera)
    await session.commit()
