"""Router dependencies for Raspberry Pi Camera plugin routers."""

from typing import Annotated

from fastapi import Depends
from fastapi_filter import FilterDepends
from pydantic import UUID4

from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.auth.exceptions import UserHasNoOrgError, UserIsNotMemberError
from app.api.auth.models import User
from app.api.common.crud.query import require_model
from app.api.common.ownership import get_user_owned_object
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.plugins.rpi_cam.exceptions import InvalidCameraOwnershipTransferError
from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.schemas import CameraFilter, CameraFilterWithOwner, CameraUpdate

### FastAPI-Filters ###
CameraFilterDep = Annotated[CameraFilter, FilterDepends(CameraFilter)]
CameraFilterWithOwnerDep = Annotated[CameraFilterWithOwner, FilterDepends(CameraFilterWithOwner)]
OWNER_ID_FIELD = "owner_id"


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


async def get_camera_transfer_owner_id(
    camera_in: CameraUpdate,
    db_camera: UserOwnedCameraDep,
    session: AsyncSessionDep,
) -> UUID4 | None:
    """Validate ownership transfer requests and return the resolved owner ID."""
    if OWNER_ID_FIELD not in camera_in.model_fields_set:
        return None

    new_owner_id = camera_in.owner_id
    if new_owner_id is None:
        raise InvalidCameraOwnershipTransferError

    current_owner = await require_model(session, User, db_camera.owner_id)
    new_owner = await require_model(session, User, new_owner_id)

    if current_owner.id != new_owner.id:
        if current_owner.organization_id is None:
            raise UserHasNoOrgError(
                user_id=current_owner.id,
                details="Camera ownership can only be transferred within the same organization.",
            )
        if new_owner.organization_id != current_owner.organization_id:
            raise UserIsNotMemberError(
                user_id=new_owner.id,
                organization_id=current_owner.organization_id,
                details="Camera ownership can only be transferred within the same organization.",
            )

    return new_owner_id


CameraTransferOwnerIDDep = Annotated[UUID4 | None, Depends(get_camera_transfer_owner_id)]
