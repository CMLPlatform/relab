"""CRUD operations for the Raspberry Pi Camera plugin."""

from pydantic import UUID4
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.common.crud.persistence import commit_and_refresh, update_and_commit
from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.schemas import CameraCreate, CameraUpdate


async def create_camera(db: AsyncSession, camera: CameraCreate, owner_id: UUID4) -> Camera:
    """Create a new WebSocket-relayed camera in the database."""
    camera_data = camera.model_dump(exclude_unset=True)
    public_key = camera_data.pop("relay_public_key_jwk")
    db_camera = Camera(
        **camera_data,
        owner_id=owner_id,
        relay_public_key_jwk=public_key,
    )
    return await commit_and_refresh(db, db_camera)


async def update_camera(
    db: AsyncSession,
    db_camera: Camera,
    camera_in: CameraUpdate,
    *,
    new_owner_id: UUID4 | None = None,
) -> Camera:
    """Update an existing camera."""
    camera_data = camera_in.model_dump(exclude_unset=True)
    camera_data.pop("owner_id", None)

    if new_owner_id is not None:
        db_camera.owner_id = new_owner_id

    camera_in_without_owner = CameraUpdate.model_validate(camera_data)
    return await update_and_commit(db, db_camera, camera_in_without_owner)
