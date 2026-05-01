"""Router dependencies for Raspberry Pi Camera plugin routers."""

from typing import Annotated

from fastapi import Depends
from fastapi_filter import FilterDepends
from pydantic import UUID4

from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.common.crud.query import require_model
from app.api.common.ownership import get_user_owned_object
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.schemas import CameraFilter, CameraFilterWithOwner

### FastAPI-Filters ###
CameraFilterDep = Annotated[CameraFilter, FilterDepends(CameraFilter)]
CameraFilterWithOwnerDep = Annotated[CameraFilterWithOwner, FilterDepends(CameraFilterWithOwner)]


### Camera Lookup Dependencies ###
async def get_camera_by_id(camera_id: UUID4, session: AsyncSessionDep) -> Camera:
    """Retrieve a camera by ID."""
    return await require_model(session, Camera, camera_id)


CameraByIDDep = Annotated[Camera, Depends(get_camera_by_id)]


### Ownership Dependencies ###
async def get_user_owned_camera(
    camera_id: UUID4,
    session: AsyncSessionDep,
    current_user: CurrentActiveUserDep,
) -> Camera:
    """Dependency function to retrieve a camera by ID and ensure it's owned by the current user."""
    return await get_user_owned_object(session, Camera, camera_id, current_user.id)


UserOwnedCameraDep = Annotated[Camera, Depends(get_user_owned_camera)]
