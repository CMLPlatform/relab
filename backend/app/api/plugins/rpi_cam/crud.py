"""CRUD operations for the Raspberry Pi Camera plugin."""

from pydantic import UUID4
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.common.crud.persistence import commit_and_refresh, update_and_commit
from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.schemas import CameraCreate, CameraUpdate
from app.api.plugins.rpi_cam.utils.encryption import encrypt_str, generate_api_key


async def create_camera(db: AsyncSession, camera: CameraCreate, owner_id: UUID4) -> Camera:
    """Create a new camera in the database."""
    # Generate api key
    api_key = generate_api_key()

    # Extract camera data and auth headers
    camera_data = camera.model_dump(exclude_unset=True)
    auth_header_dict = camera_data.pop("auth_headers", None)

    # Create camera
    db_camera = Camera(
        **camera_data,
        owner_id=owner_id,
        encrypted_api_key=encrypt_str(api_key),
    )

    # Add additional auth headers if provided
    if auth_header_dict:
        db_camera.set_auth_headers(auth_header_dict)

    return await commit_and_refresh(db, db_camera)


async def update_camera(
    db: AsyncSession,
    db_camera: Camera,
    camera_in: CameraUpdate,
    *,
    new_owner_id: UUID4 | None = None,
) -> Camera:
    """Update an existing camera in the database."""
    # Extract camera data and auth headers
    camera_data = camera_in.model_dump(exclude_unset=True)
    auth_header_dict = camera_data.pop("auth_headers", None)
    camera_data.pop("owner_id", None)

    if new_owner_id is not None:
        db_camera.owner_id = new_owner_id

    # Update auth headers if provided
    if auth_header_dict:
        db_camera.set_auth_headers(auth_header_dict)

    camera_in_without_auth_headers = CameraUpdate.model_validate(camera_data)
    return await update_and_commit(db, db_camera, camera_in_without_auth_headers)


async def regenerate_camera_api_key(db: AsyncSession, db_camera: Camera) -> Camera:
    """Regenerate API key for an existing camera."""
    # Generate and encrypt new API key
    new_api_key = generate_api_key()
    db_camera.encrypted_api_key = encrypt_str(new_api_key)

    return await commit_and_refresh(db, db_camera)
