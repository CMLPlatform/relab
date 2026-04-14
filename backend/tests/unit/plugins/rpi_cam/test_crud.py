"""Unit tests for RPi Cam plugin CRUD operations."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from app.api.plugins.rpi_cam.crud import create_camera, update_camera
from app.api.plugins.rpi_cam.models import Camera, CameraCredentialStatus
from app.api.plugins.rpi_cam.schemas import CameraCreate, CameraUpdate

if TYPE_CHECKING:
    from unittest.mock import AsyncMock
    from uuid import UUID

    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User

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
NEW_KEY_ID = "key-67890"


def require_uuid(value: UUID | None) -> UUID:
    """Narrow optional UUID values produced by Pydantic models."""
    assert value is not None
    return value


def build_camera(*, owner_id: UUID, name: str = TEST_OLD_NAME) -> Camera:
    """Build a camera for CRUD tests."""
    return Camera(name=name, owner_id=owner_id, relay_public_key_jwk=PUBLIC_JWK, relay_key_id=KEY_ID)


async def test_create_camera(session: AsyncSession, superuser: User) -> None:
    """Test creating a new camera entry with device public key metadata."""
    owner_id = require_uuid(superuser.id)
    camera_in = CameraCreate(
        name=TEST_CAMERA_NAME,
        description=TEST_CAMERA_DESC,
        relay_public_key_jwk=PUBLIC_JWK,
        relay_key_id=KEY_ID,
    )

    camera = await create_camera(session, camera_in, owner_id)

    assert camera.name == TEST_CAMERA_NAME
    assert camera.description == TEST_CAMERA_DESC
    assert camera.relay_public_key_jwk == PUBLIC_JWK
    assert camera.relay_key_id == KEY_ID
    assert camera.owner_id == owner_id

    db_camera = await session.get(Camera, camera.id)
    assert db_camera is not None
    assert db_camera.name == TEST_CAMERA_NAME


async def test_update_camera(session: AsyncSession, superuser: User) -> None:
    """Test updating mutable camera metadata and credential status."""
    owner_id = require_uuid(superuser.id)
    camera = build_camera(owner_id=owner_id)
    session.add(camera)
    await session.commit()
    await session.refresh(camera)

    update_data = CameraUpdate(name=TEST_NEW_NAME, relay_credential_status=CameraCredentialStatus.REVOKED)

    updated_camera = await update_camera(session, camera, update_data)

    assert updated_camera.name == TEST_NEW_NAME
    assert updated_camera.relay_credential_status == CameraCredentialStatus.REVOKED

    await session.refresh(camera)
    assert camera.name == TEST_NEW_NAME
    assert camera.relay_credential_status == CameraCredentialStatus.REVOKED


async def test_update_camera_applies_validated_owner_transfer(mock_session: AsyncMock) -> None:
    """CRUD applies an owner change once the router has already validated it."""
    camera = build_camera(owner_id=uuid.uuid4())
    new_owner_id = uuid.uuid4()
    update_data = CameraUpdate.model_validate({"owner_id": new_owner_id, "relay_key_id": NEW_KEY_ID})

    updated_camera = await update_camera(mock_session, camera, update_data, new_owner_id=new_owner_id)

    assert updated_camera.owner_id == new_owner_id
    assert updated_camera.relay_key_id == NEW_KEY_ID
    mock_session.commit.assert_awaited_once()
