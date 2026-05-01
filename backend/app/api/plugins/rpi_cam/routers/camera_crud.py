"""Camera CRUD operations for Raspberry Pi Camera plugin."""

import logging
from typing import TYPE_CHECKING

from fastapi import BackgroundTasks, HTTPException, Query
from pydantic import UUID4
from relab_rpi_cam_models import LocalAccessInfo
from sqlalchemy import select

from app.api.audiences import DeviceAPIRouter
from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.common.crud.filtering import apply_filter
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.plugins.rpi_cam import crud
from app.api.plugins.rpi_cam.dependencies import CameraFilterDep, UserOwnedCameraDep
from app.api.plugins.rpi_cam.device_assertion import AuthenticatedCameraDep
from app.api.plugins.rpi_cam.examples import (
    CAMERA_INCLUDE_STATUS_OPENAPI_EXAMPLES,
)
from app.api.plugins.rpi_cam.models import Camera, CameraConnectionStatus, CameraStatus
from app.api.plugins.rpi_cam.runtime_preview import get_preview_thumbnail_path, get_preview_thumbnail_urls_per_camera
from app.api.plugins.rpi_cam.runtime_status import get_camera_status as fetch_camera_status
from app.api.plugins.rpi_cam.schemas import CameraCreate, CameraRead, CameraReadWithStatus, CameraUpdate
from app.api.plugins.rpi_cam.websocket.relay import relay_via_websocket
from app.core.redis import OptionalRedisDep

if TYPE_CHECKING:
    from collections.abc import Sequence
    from pathlib import Path

    from redis.asyncio import Redis

logger = logging.getLogger(__name__)

camera_router = PublicAPIRouter(tags=["rpi-cam-management"])
device_router = DeviceAPIRouter(tags=["rpi-cam-device"])
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
    statement = apply_filter(statement, Camera, camera_filter)
    db_cameras = list((await session.execute(statement)).scalars().unique().all())

    if not (include_status or include_telemetry):
        return list(db_cameras)

    preview_thumbnail_urls: dict[UUID4, str | None] = {}
    if include_telemetry:
        preview_thumbnail_urls = get_preview_thumbnail_urls_per_camera([camera.id for camera in db_cameras])

    return [
        await CameraReadWithStatus.from_db_model_with_status(
            camera,
            redis,
            include_telemetry=include_telemetry,
            preview_thumbnail_url=preview_thumbnail_urls.get(camera.id),
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
    preview_thumbnail_url: str | None = None
    if include_telemetry:
        preview_thumbnail_url = get_preview_thumbnail_urls_per_camera([db_camera.id]).get(db_camera.id)
    return await CameraReadWithStatus.from_db_model_with_status(
        db_camera,
        redis,
        include_telemetry=include_telemetry,
        preview_thumbnail_url=preview_thumbnail_url,
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
) -> Camera:
    """Update Raspberry Pi camera."""
    return await crud.update_camera(session, db_camera, camera_in)


@camera_router.delete("/{camera_id}", summary="Delete Raspberry Pi camera", status_code=204)
async def delete_user_camera(
    background_tasks: BackgroundTasks,
    db: AsyncSessionDep,
    camera: UserOwnedCameraDep,
    redis: OptionalRedisDep,
) -> None:
    """Delete Raspberry Pi camera."""
    preview_thumbnail_path = get_preview_thumbnail_path(camera.id)
    await db.delete(camera)
    await db.commit()
    background_tasks.add_task(_notify_camera_unpair, camera.id, redis)
    background_tasks.add_task(_remove_preview_thumbnail, preview_thumbnail_path)


@device_router.delete(
    "/{camera_id}/self",
    summary="Pi-initiated self-unpair",
    status_code=204,
    description=(
        "Called by the Pi when the user triggers unpair from the local /setup page. "
        "Authenticates via the device's ES256 assertion. Deletes the camera from the "
        "database so the backend no longer shows it as offline."
    ),
)
async def self_unpair_camera(
    camera: AuthenticatedCameraDep,
    db: AsyncSessionDep,
) -> None:
    """Device-initiated self-deletion. Pi calls this on local unpair."""
    logger.info("Camera %s self-unpaired via device assertion", camera.id)
    _remove_preview_thumbnail(get_preview_thumbnail_path(camera.id))
    await db.delete(camera)
    await db.commit()


@camera_router.get(
    "/{camera_id}/local-access",
    response_model=LocalAccessInfo,
    summary="Get local direct-connection info for a camera",
    description=(
        "Relays GET /system/local-access to the Pi via the WebSocket connection. "
        "Returns the local API key and candidate IP addresses so the frontend can "
        "auto-configure Ethernet/USB-C direct access without manual key copying. "
        "Returns 503 when the camera is offline."
    ),
)
async def get_camera_local_access(
    db_camera: UserOwnedCameraDep,
    redis: OptionalRedisDep,
) -> LocalAccessInfo:
    """Relay local access info from the Pi to the authenticated frontend user."""
    response = await relay_via_websocket(
        db_camera.id,
        "GET",
        "/system/local-access",
        redis=redis,
        error_msg="Could not retrieve local access info from camera",
    )
    return LocalAccessInfo.model_validate(response.json())


async def _notify_camera_unpair(camera_id: UUID4, redis: Redis | None) -> None:
    """Best-effort relay of DELETE /pairing to the camera.

    Logs a warning and continues if the camera is offline or unresponsive —
    deletion should never be blocked by camera connectivity.
    """
    status = await fetch_camera_status(redis, camera_id)
    if status.connection != CameraConnectionStatus.ONLINE:
        logger.info("Skipping unpair relay for offline camera %s.", camera_id)
        return

    try:
        await relay_via_websocket(camera_id, "DELETE", "/pairing", redis=redis)
    except HTTPException as exc:
        logger.warning(
            "Could not notify camera %s to unpair (HTTP %d) — deleting anyway.",
            camera_id,
            exc.status_code,
        )


def _remove_preview_thumbnail(path: Path) -> None:
    """Best-effort cleanup of a camera's cached preview thumbnail file."""
    try:
        path.unlink(missing_ok=True)
    except OSError:
        logger.warning("Could not remove preview thumbnail at %s", path)


router.include_router(camera_router, prefix="/plugins/rpi-cam/cameras")
