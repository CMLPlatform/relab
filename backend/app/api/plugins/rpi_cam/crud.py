"""CRUD operations for the Raspberry Pi Camera plugin."""

from pydantic import UUID4
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.common.utils import get_user_owned_object
from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.schemas import CameraCreate, CameraUpdate
from app.api.plugins.rpi_cam.utils.encryption import encrypt_str, generate_api_key


### CRUD Operations ###
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

    # Save to database
    db.add(db_camera)
    await db.commit()
    await db.refresh(db_camera)

    return db_camera


async def update_camera(db: AsyncSession, db_camera: Camera, camera_in: CameraUpdate) -> Camera:
    """Update an existing camera in the database."""
    # Extract camera data and auth headers
    camera_data = camera_in.model_dump(exclude_unset=True)
    auth_header_dict = camera_data.pop("auth_headers", None)

    db_camera.sqlmodel_update(camera_data)

    # Update auth headers if provided
    if auth_header_dict:
        db_camera.set_auth_headers(auth_header_dict)

    # Save to database
    db.add(db_camera)
    await db.commit()
    await db.refresh(db_camera)
    return db_camera


async def regenerate_camera_api_key(db: AsyncSession, camera_id: UUID4, owner_id: UUID4) -> Camera:
    """Regenerate API key for an existing camera."""
    # Validate ownership
    db_camera = await get_user_owned_object(db, Camera, camera_id, owner_id)

    # Generate and encrypt new API key
    new_api_key = generate_api_key()
    db_camera.encrypted_api_key = encrypt_str(new_api_key)

    # Save to database
    db.add(db_camera)
    await db.commit()
    await db.refresh(db_camera)

    return db_camera
