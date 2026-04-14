"""Camera CRUD operations for Raspberry Pi Camera plugin."""

from typing import TYPE_CHECKING

from fastapi import Query
from sqlalchemy import select

from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.common.crud.base import get_models
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.plugins.rpi_cam import crud
from app.api.plugins.rpi_cam.dependencies import CameraFilterDep, CameraTransferOwnerIDDep, UserOwnedCameraDep
from app.api.plugins.rpi_cam.examples import (
    CAMERA_FORCE_REFRESH_OPENAPI_EXAMPLES,
    CAMERA_INCLUDE_STATUS_OPENAPI_EXAMPLES,
)
from app.api.plugins.rpi_cam.models import Camera, CameraStatus
from app.api.plugins.rpi_cam.schemas import CameraCreate, CameraRead, CameraReadWithStatus, CameraUpdate
from app.api.plugins.rpi_cam.services import get_camera_status as fetch_camera_status
from app.core.redis import OptionalRedisDep

if TYPE_CHECKING:
    from collections.abc import Sequence

camera_router = PublicAPIRouter(tags=["rpi-cam-management"])
router = PublicAPIRouter()


@camera_router.get(
    "",
    response_model=list[CameraRead] | list[CameraReadWithStatus],
    summary="Get Raspberry Pi cameras of the current user",
)
async def get_user_cameras(
    session: AsyncSessionDep,
    current_user: CurrentActiveUserDep,
    camera_filter: CameraFilterDep,
    redis: OptionalRedisDep,
    *,
    include_status: bool = Query(
        default=False,
        description="Include camera online status",
        openapi_examples=CAMERA_INCLUDE_STATUS_OPENAPI_EXAMPLES,
    ),
) -> Sequence[Camera | CameraReadWithStatus]:
    """Get all Raspberry Pi cameras of the current user."""
    statement = select(Camera).where(Camera.owner_id == current_user.id)
    db_cameras = await get_models(session, Camera, model_filter=camera_filter, statement=statement)

    return [
        await CameraReadWithStatus.from_db_model_with_status(camera, redis) if include_status else camera
        for camera in db_cameras
    ]


@camera_router.get(
    "/{camera_id}",
    response_model=CameraRead | CameraReadWithStatus,
    summary="Get Raspberry Pi camera by ID",
)
async def get_user_camera(
    db_camera: UserOwnedCameraDep,
    redis: OptionalRedisDep,
    *,
    include_status: bool = Query(
        default=False,
        description="Include camera online status",
        openapi_examples=CAMERA_INCLUDE_STATUS_OPENAPI_EXAMPLES,
    ),
) -> Camera | CameraReadWithStatus:
    """Get single Raspberry Pi camera by ID, if owned by the current user."""
    return await CameraReadWithStatus.from_db_model_with_status(db_camera, redis) if include_status else db_camera


@camera_router.get(
    "/{camera_id}/status",
    summary="Get Raspberry Pi camera online status",
)
async def get_user_camera_status(
    db_camera: UserOwnedCameraDep,
    redis: OptionalRedisDep,
) -> CameraStatus:
    """Get Raspberry Pi camera online status."""
    return await fetch_camera_status(redis, db_camera.id)


@camera_router.post(
    "",
    response_model=CameraRead,
    summary="Register new Raspberry Pi camera",
    status_code=201,
)
async def register_user_camera(
    camera: CameraCreate, session: AsyncSessionDep, current_user: CurrentActiveUserDep
) -> Camera:
    """Register a new Raspberry Pi camera.

    The normal user flow is /plugins/rpi-cam/pairing/claim. This endpoint is
    kept as a structured API surface for tests/admin automation and still
    requires a public device key.
    """
    return await crud.create_camera(session, camera, current_user.id)


@camera_router.patch("/{camera_id}", response_model=CameraRead, summary="Update Raspberry Pi camera")
async def update_user_camera(
    *,
    session: AsyncSessionDep,
    db_camera: UserOwnedCameraDep,
    camera_in: CameraUpdate,
    transfer_owner_id: CameraTransferOwnerIDDep,
) -> Camera:
    """Update Raspberry Pi camera."""
    return await crud.update_camera(session, db_camera, camera_in, new_owner_id=transfer_owner_id)


@camera_router.delete("/{camera_id}", summary="Delete Raspberry Pi camera", status_code=204)
async def delete_user_camera(db: AsyncSessionDep, camera: UserOwnedCameraDep) -> None:
    """Delete Raspberry Pi camera."""
    await db.delete(camera)
    await db.commit()


router.include_router(camera_router, prefix="/plugins/rpi-cam/cameras")
router.include_router(camera_router, prefix="/users/me/cameras")
