"""Unit tests for RPi Cam plugin CRUD operations."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import MagicMock, patch

import pytest
from pydantic import HttpUrl, SecretStr

from app.api.plugins.rpi_cam.crud import create_camera, regenerate_camera_api_key, update_camera
from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.schemas import CameraCreate, CameraUpdate, HeaderCreate

if TYPE_CHECKING:
    from collections.abc import Generator

    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.api.auth.models import User

# Constants for test values
TEST_CAMERA_NAME = "Test Camera"
TEST_CAMERA_DESC = "Test Description"
TEST_CAMERA_URL_CREATE = HttpUrl("http://example.com/api")
TEST_CAMERA_URL = "http://example.com/api"
TEST_OLD_NAME = "Old Name"
TEST_NEW_NAME = "New Name"
TEST_OLD_URL = "http://old.com"
TEST_ENC_KEY = "encrypted_key"
TEST_OLD_KEY = "old_key"
TEST_NEW_KEY = "new_api_key"
TEST_NEW_ENC_KEY = "new_encrypted_key"
TEST_GEN_KEY = "generated_api_key"
TEST_AUTH_VAL = SecretStr("123")
TEST_NEW_AUTH_VAL = SecretStr("456")
TEST_ENC_HEADERS = "encrypted_headers"


def build_camera(*, owner_id: str, name: str, encrypted_api_key: str, url: str) -> Camera:
    """Build a camera for CRUD tests."""
    return Camera(name=name, owner_id=owner_id, encrypted_api_key=encrypted_api_key, url=url)


@pytest.fixture
def mock_encryption() -> Generator[MagicMock]:
    """Mock the encryption utility."""
    with patch("app.api.plugins.rpi_cam.crud.encrypt_str") as mocked_encrypt:
        mocked_encrypt.return_value = TEST_ENC_KEY
        yield mocked_encrypt


@pytest.fixture
def mock_generate_api_key() -> Generator[MagicMock]:
    """Mock the API key generation utility."""
    with patch("app.api.plugins.rpi_cam.crud.generate_api_key") as mocked_gen:
        mocked_gen.return_value = TEST_GEN_KEY
        yield mocked_gen


@pytest.fixture
def mock_get_user_owned_object() -> Generator[MagicMock]:
    """Mock the utility for retrieving user-owned objects."""
    with patch("app.api.plugins.rpi_cam.crud.get_user_owned_object") as mocked_get:
        yield mocked_get


@pytest.mark.asyncio
async def test_create_camera(
    session: AsyncSession,
    mock_encryption: MagicMock,
    mock_generate_api_key: MagicMock,
    superuser: User,
) -> None:
    """Test creating a new camera entry."""
    owner_id = superuser.id
    headers = [HeaderCreate(key="X-Auth", value=TEST_AUTH_VAL)]
    camera_in = CameraCreate(
        name=TEST_CAMERA_NAME, description=TEST_CAMERA_DESC, url=TEST_CAMERA_URL_CREATE, auth_headers=headers
    )

    camera = await create_camera(session, camera_in, owner_id)

    assert camera.name == TEST_CAMERA_NAME
    assert camera.description == TEST_CAMERA_DESC
    assert camera.url == str(TEST_CAMERA_URL_CREATE)
    assert camera.owner_id == owner_id
    assert camera.encrypted_api_key == TEST_ENC_KEY

    mock_generate_api_key.assert_called_once()
    mock_encryption.assert_called_with(TEST_GEN_KEY)

    # Verify DB
    db_camera = await session.get(Camera, camera.id)
    assert db_camera is not None
    assert db_camera.name == TEST_CAMERA_NAME


@pytest.mark.asyncio
async def test_update_camera(session: AsyncSession, superuser: User) -> None:
    """Test updating an existing camera entry."""
    # Setup existing camera
    owner_id = superuser.id
    camera = build_camera(owner_id=owner_id, name=TEST_OLD_NAME, encrypted_api_key=TEST_OLD_KEY, url=TEST_OLD_URL)
    session.add(camera)
    await session.commit()
    await session.refresh(camera)

    headers = [HeaderCreate(key="X-New", value=TEST_NEW_AUTH_VAL)]
    update_data = CameraUpdate(name=TEST_NEW_NAME, auth_headers=headers)

    # We need to mock encrypt_dict locally for update since it calls set_auth_headers
    with patch("app.api.plugins.rpi_cam.models.encrypt_dict") as mock_encrypt_dict:
        mock_encrypt_dict.return_value = TEST_ENC_HEADERS
        updated_camera = await update_camera(session, camera, update_data)

    assert updated_camera.name == TEST_NEW_NAME
    assert updated_camera.encrypted_auth_headers == TEST_ENC_HEADERS

    # Verify DB
    await session.refresh(camera)
    assert camera.name == TEST_NEW_NAME
    assert camera.encrypted_auth_headers == TEST_ENC_HEADERS


@pytest.mark.asyncio
async def test_regenerate_camera_api_key(
    session: AsyncSession,
    mock_encryption: MagicMock,
    mock_generate_api_key: MagicMock,
    mock_get_user_owned_object: MagicMock,
    superuser: User,
) -> None:
    """Test regenerating the API key for an existing camera."""
    owner_id = superuser.id
    camera = build_camera(
        owner_id=owner_id,
        name=TEST_CAMERA_NAME,
        encrypted_api_key=TEST_OLD_KEY,
        url=TEST_CAMERA_URL,
    )
    session.add(camera)
    await session.commit()
    await session.refresh(camera)

    # Mock get_user_owned_object to return the camera
    mock_get_user_owned_object.return_value = camera

    # Change generated key for this test
    mock_generate_api_key.return_value = TEST_NEW_KEY
    mock_encryption.return_value = TEST_NEW_ENC_KEY

    updated_camera = await regenerate_camera_api_key(session, camera.id, owner_id)

    assert updated_camera.encrypted_api_key == TEST_NEW_ENC_KEY

    mock_get_user_owned_object.assert_called_once_with(session, Camera, camera.id, owner_id)
    mock_encryption.assert_called_with(TEST_NEW_KEY)
