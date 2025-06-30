"""Camera CRUD operations for Raspberry Pi Camera plugin."""

from collections.abc import Sequence

from fastapi import Query
from pydantic import UUID4
from sqlmodel import select

from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.common.crud.base import get_models
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.common.utils import get_user_owned_object
from app.api.plugins.rpi_cam import crud
from app.api.plugins.rpi_cam.dependencies import CameraFilterDep, UserOwnedCameraDep
from app.api.plugins.rpi_cam.models import Camera, CameraStatus
from app.api.plugins.rpi_cam.schemas import (
    CameraCreate,
    CameraRead,
    CameraReadWithCredentials,
    CameraReadWithStatus,
    CameraUpdate,
)

# TODO improve exception handling, add custom exceptions and return more granular HTTP codes
# (.e.g. 404 on missing camera, 403 on unauthorized access)

# TODO: Decide on proper path for user-dependent operations (e.g. cameras, organizations, etc.)
router = PublicAPIRouter(prefix="/plugins/rpi-cam/cameras", tags=["rpi-cam-management"])


## GET ##
# TODO: Consider expanding get routes to cameras owned by any members of the organization of the user
@router.get(
    "",
    response_model=list[CameraRead] | list[CameraReadWithStatus],
    summary="Get Raspberry Pi cameras of the current user",
)
async def get_user_cameras(
    session: AsyncSessionDep,
    current_user: CurrentActiveUserDep,
    camera_filter: CameraFilterDep,
    *,
    include_status: bool = Query(default=False, description="Include camera online status"),
) -> Sequence[Camera | CameraReadWithStatus]:
    """Get all Raspberry Pi cameras of the current user."""
    statement = select(Camera).where(Camera.owner_id == current_user.id)
    db_cameras = await get_models(session, Camera, model_filter=camera_filter, statement=statement)

    return [
        await CameraReadWithStatus.from_db_model_with_status(camera) if include_status else camera
        for camera in db_cameras
    ]


@router.get("/{camera_id}", response_model=CameraRead | CameraReadWithStatus, summary="Get Raspberry Pi camera by ID")
async def get_user_camera(
    camera_id: UUID4,
    session: AsyncSessionDep,
    current_user: CurrentActiveUserDep,
    *,
    include_status: bool = Query(default=False, description="Include camera online status"),
) -> Camera | CameraReadWithStatus:
    """Get single Raspberry Pi camera by ID, if owned by the current user."""
    db_camera = await get_user_owned_object(session, Camera, camera_id, current_user.id)

    return await CameraReadWithStatus.from_db_model_with_status(db_camera) if include_status else db_camera


@router.get(
    "/{camera_id}/status",
    summary="Get Raspberry Pi camera online status",
)
async def get_user_camera_status(
    camera_id: UUID4,
    session: AsyncSessionDep,
    current_user: CurrentActiveUserDep,
    *,
    force_refresh: bool = Query(default=False, description="Force a refresh of the status by bypassing the cache"),
) -> CameraStatus:
    """Get Raspberry Pi camera online status."""
    db_camera = await get_user_owned_object(session, Camera, camera_id, current_user.id)

    return await db_camera.get_status(force_refresh=force_refresh)


## POST
@router.post("", response_model=CameraReadWithCredentials, summary="Register new Raspberry Pi camera", status_code=201)
async def register_user_camera(
    camera: CameraCreate, session: AsyncSessionDep, current_user: CurrentActiveUserDep
) -> CameraReadWithCredentials:
    """Register a new Raspberry Pi camera."""
    db_camera = await crud.create_camera(
        session,
        camera,
        current_user.id,
    )

    return CameraReadWithCredentials.from_db_model_with_credentials(db_camera)


@router.post(
    "/{camera_id}/regenerate-api-key",
    response_model=CameraReadWithCredentials,
    summary="Regenerate API key for the Raspberry Pi camera",
    status_code=201,
)
async def regenerate_api_key(
    camera_id: UUID4,
    session: AsyncSessionDep,
    current_user: CurrentActiveUserDep,
) -> CameraReadWithCredentials:
    """Regenerate API key for Raspberry Pi camera."""
    db_camera = await crud.regenerate_camera_api_key(session, camera_id, current_user.id)

    return CameraReadWithCredentials.from_db_model_with_credentials(db_camera)


## PATCH
@router.patch("/{camera_id}", response_model=CameraRead, summary="Update Raspberry Pi camera")
async def update_user_camera(
    *, session: AsyncSessionDep, db_camera: UserOwnedCameraDep, camera_in: CameraUpdate
) -> Camera:
    """Update Raspberry Pi camera."""
    db_camera = await crud.update_camera(session, db_camera, camera_in)

    return db_camera


## DELETE
@router.delete("/{camera_id}", summary="Delete Raspberry Pi camera", status_code=204)
async def delete_user_camera(db: AsyncSessionDep, camera: UserOwnedCameraDep) -> None:
    """Delete Raspberry Pi camera."""
    await db.delete(camera)
    await db.commit()
