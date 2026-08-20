"""CRUD operations for the Raspberry Pi Camera plugin."""

from pydantic import UUID4
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.common.crud.persistence import commit_and_refresh
from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.schemas import CameraCreate


async def create_camera(db: AsyncSession, camera: CameraCreate, owner_id: UUID4) -> Camera:
    """Create a new WebSocket-relayed camera in the database."""
    camera_data = camera.model_dump(exclude_unset=True)
    db_camera = Camera(**camera_data, owner_id=owner_id)
    return await commit_and_refresh(db, db_camera)
