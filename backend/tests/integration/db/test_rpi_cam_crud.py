"""Integration tests for RPi Cam plugin CRUD operations."""

from typing import TYPE_CHECKING

import pytest

from app.api.common.crud.persistence import update_and_commit
from app.api.plugins.rpi_cam.crud import create_camera
from app.api.plugins.rpi_cam.models import Camera, CameraCredentialStatus
from app.api.plugins.rpi_cam.schemas import CameraCreate, CameraUpdate, RelayPublicKeyJWK
from tests.factories.models import CameraFactory

if TYPE_CHECKING:
    from uuid import UUID

    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User

pytestmark = pytest.mark.db
TEST_CAMERA_NAME = "Test Camera"
TEST_CAMERA_DESC = "Test Description"
TEST_OLD_NAME = "Old Name"
TEST_NEW_NAME = "New Name"
PUBLIC_JWK = {
    "kty": "EC",
    "crv": "P-256",
    "x": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "y": "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    "kid": "key-12345",
}
KEY_ID = "key-12345"


def require_uuid(value: UUID | None) -> UUID:
    """Narrow optional UUID values produced by Pydantic models."""
    assert value is not None
    return value


async def test_create_camera(db_session: AsyncSession, db_superuser: User) -> None:
    """Test creating a new camera entry with device public key metadata."""
    owner_id = require_uuid(db_superuser.id)
    camera_in = CameraCreate(
        name=TEST_CAMERA_NAME,
        description=TEST_CAMERA_DESC,
        relay_public_key_jwk=RelayPublicKeyJWK(**PUBLIC_JWK),
        relay_key_id=KEY_ID,
    )

    camera = await create_camera(db_session, camera_in, owner_id)

    assert camera.name == TEST_CAMERA_NAME
    assert camera.description == TEST_CAMERA_DESC
    assert camera.relay_public_key_jwk == PUBLIC_JWK
    assert camera.relay_key_id == KEY_ID
    assert camera.owner_id == owner_id

    db_camera = await db_session.get(Camera, camera.id)
    assert db_camera is not None
    assert db_camera.name == TEST_CAMERA_NAME


async def test_update_camera(db_session: AsyncSession, db_superuser: User) -> None:
    """Test updating mutable camera metadata and credential status."""
    owner_id = require_uuid(db_superuser.id)
    camera = await CameraFactory.create_async(db_session, owner_id=owner_id, name=TEST_OLD_NAME)

    update_data = CameraUpdate(name=TEST_NEW_NAME, relay_credential_status=CameraCredentialStatus.REVOKED)

    updated_camera = await update_and_commit(db_session, camera, update_data)

    assert updated_camera.name == TEST_NEW_NAME
    assert updated_camera.relay_credential_status == CameraCredentialStatus.REVOKED
    assert updated_camera.owner_id == owner_id

    await db_session.refresh(camera)
    assert camera.name == TEST_NEW_NAME
    assert camera.relay_credential_status == CameraCredentialStatus.REVOKED
    assert camera.owner_id == owner_id
