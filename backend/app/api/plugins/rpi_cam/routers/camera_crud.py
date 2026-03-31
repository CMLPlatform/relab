"""Camera CRUD operations for Raspberry Pi Camera plugin."""

from typing import TYPE_CHECKING

from fastapi import Query
from sqlmodel import select

from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.common.crud.base import get_models
from app.api.common.routers.dependencies import AsyncSessionDep, ExternalHTTPClientDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.plugins.rpi_cam import crud
from app.api.plugins.rpi_cam.dependencies import (
    CameraFilterDep,
    CameraTransferOwnerIDDep,
    UserOwnedCameraDep,
)
from app.api.plugins.rpi_cam.examples import (
    CAMERA_FORCE_REFRESH_OPENAPI_EXAMPLES,
    CAMERA_INCLUDE_STATUS_OPENAPI_EXAMPLES,
)
from app.api.plugins.rpi_cam.models import Camera, CameraStatus
from app.api.plugins.rpi_cam.schemas import (
    CameraCreate,
    CameraRead,
    CameraReadWithCredentials,
    CameraReadWithStatus,
    CameraUpdate,
)

if TYPE_CHECKING:
    from collections.abc import Sequence

camera_router = PublicAPIRouter(tags=["rpi-cam-management"])
router = PublicAPIRouter()


## GET ##
@camera_router.get(
    "",
    response_model=list[CameraRead] | list[CameraReadWithStatus],
    summary="Get Raspberry Pi cameras of the current user",
)
async def get_user_cameras(
    session: AsyncSessionDep,
    http_client: ExternalHTTPClientDep,
    current_user: CurrentActiveUserDep,
    camera_filter: CameraFilterDep,
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
        await CameraReadWithStatus.from_db_model_with_status(camera, http_client) if include_status else camera
        for camera in db_cameras
    ]


@camera_router.get(
    "/{camera_id}",
    response_model=CameraRead | CameraReadWithStatus,
    summary="Get Raspberry Pi camera by ID",
)
async def get_user_camera(
    db_camera: UserOwnedCameraDep,
    http_client: ExternalHTTPClientDep,
    *,
    include_status: bool = Query(
        default=False,
        description="Include camera online status",
        openapi_examples=CAMERA_INCLUDE_STATUS_OPENAPI_EXAMPLES,
    ),
) -> Camera | CameraReadWithStatus:
    """Get single Raspberry Pi camera by ID, if owned by the current user."""
    return await CameraReadWithStatus.from_db_model_with_status(db_camera, http_client) if include_status else db_camera


@camera_router.get(
    "/{camera_id}/status",
    summary="Get Raspberry Pi camera online status",
)
async def get_user_camera_status(
    db_camera: UserOwnedCameraDep,
    http_client: ExternalHTTPClientDep,
    *,
    force_refresh: bool = Query(
        default=False,
        description="Force a refresh of the status by bypassing the cache",
        openapi_examples=CAMERA_FORCE_REFRESH_OPENAPI_EXAMPLES,
    ),
) -> CameraStatus:
    """Get Raspberry Pi camera online status."""
    return await db_camera.get_status(http_client, force_refresh=force_refresh)


## POST
@camera_router.post(
    "",
    response_model=CameraReadWithCredentials,
    summary="Register new Raspberry Pi camera",
    status_code=201,
)
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


@camera_router.post(
    "/{camera_id}/regenerate-api-key",
    response_model=CameraReadWithCredentials,
    summary="Regenerate API key for the Raspberry Pi camera",
    status_code=201,
)
async def regenerate_api_key(
    session: AsyncSessionDep,
    db_camera: UserOwnedCameraDep,
) -> CameraReadWithCredentials:
    """Regenerate API key for Raspberry Pi camera."""
    db_camera = await crud.regenerate_camera_api_key(session, db_camera)

    return CameraReadWithCredentials.from_db_model_with_credentials(db_camera)


## PATCH
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


## DELETE
@camera_router.delete("/{camera_id}", summary="Delete Raspberry Pi camera", status_code=204)
async def delete_user_camera(db: AsyncSessionDep, camera: UserOwnedCameraDep) -> None:
    """Delete Raspberry Pi camera."""
    await db.delete(camera)
    await db.commit()


router.include_router(camera_router, prefix="/plugins/rpi-cam/cameras")
router.include_router(camera_router, prefix="/users/me/cameras")
