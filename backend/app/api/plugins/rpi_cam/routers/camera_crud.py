"""Camera CRUD operations for Raspberry Pi Camera plugin."""

from typing import TYPE_CHECKING

from fastapi import Query
from sqlalchemy import select

from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.common.crud.query import list_models
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.plugins.rpi_cam import crud
from app.api.plugins.rpi_cam.dependencies import CameraFilterDep, CameraTransferOwnerIDDep, UserOwnedCameraDep
from app.api.plugins.rpi_cam.examples import (
    CAMERA_INCLUDE_STATUS_OPENAPI_EXAMPLES,
)
from app.api.plugins.rpi_cam.models import Camera, CameraStatus
from app.api.plugins.rpi_cam.schemas import CameraCreate, CameraRead, CameraReadWithStatus, CameraUpdate
from app.api.plugins.rpi_cam.services import (
    get_camera_status as fetch_camera_status,
)
from app.api.plugins.rpi_cam.services import (
    get_last_image_url_per_camera,
)
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
    include_telemetry: bool = Query(
        default=False,
        description=(
            "Include the last-known telemetry snapshot from the Redis cache. Implies "
            "``include_status=true``. No relay round-trips — cameras without cached telemetry "
            "come back with ``telemetry: null``."
        ),
    ),
) -> Sequence[Camera | CameraReadWithStatus]:
    """Get all Raspberry Pi cameras of the current user."""
    statement = select(Camera).where(Camera.owner_id == current_user.id)
    db_cameras = await list_models(session, Camera, filters=camera_filter, statement=statement)

    if not (include_status or include_telemetry):
        return list(db_cameras)

    # Batch-fetch the most recent capture URL per camera in one query so the
    # mosaic list doesn't fan out N DB round-trips. When telemetry isn't
    # requested we skip this too — no point paying the query cost for a
    # caller that just wants online/offline status.
    last_image_urls: dict = {}
    if include_telemetry:
        camera_ids = [camera.id for camera in db_cameras]
        last_image_urls = await get_last_image_url_per_camera(session, camera_ids)

    return [
        await CameraReadWithStatus.from_db_model_with_status(
            camera,
            redis,
            include_telemetry=include_telemetry,
            last_image_url=last_image_urls.get(camera.id),
        )
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
    session: AsyncSessionDep,
    *,
    include_status: bool = Query(
        default=False,
        description="Include camera online status",
        openapi_examples=CAMERA_INCLUDE_STATUS_OPENAPI_EXAMPLES,
    ),
    include_telemetry: bool = Query(
        default=False,
        description="Include last-known telemetry from the Redis cache. Implies ``include_status=true``.",
    ),
) -> Camera | CameraReadWithStatus:
    """Get single Raspberry Pi camera by ID, if owned by the current user."""
    if not (include_status or include_telemetry):
        return db_camera
    last_image_url: str | None = None
    if include_telemetry:
        urls = await get_last_image_url_per_camera(session, [db_camera.id])
        last_image_url = urls.get(db_camera.id)
    return await CameraReadWithStatus.from_db_model_with_status(
        db_camera,
        redis,
        include_telemetry=include_telemetry,
        last_image_url=last_image_url,
    )


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
