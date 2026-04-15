"""Shared support code for split RPi Cam stream-router tests."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import uuid4

import pytest
from pydantic import SecretStr

from app.api.auth.models import User
from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.schemas import RelayPublicKeyJWK
from app.api.plugins.rpi_cam.services import YoutubeStreamConfigWithID
from tests.factories.models import UserFactory

if TYPE_CHECKING:
    from uuid import UUID

TEST_EMAIL = "test@example.com"
TEST_HASHED_PASSWORD = "hashed_password"
TEST_CAMERA_NAME = "Test Camera"
TEST_CAMERA_DESC = "Test Camera"
TEST_STREAM_URL = "http://stream.url"
YOUTUBE_STREAM_URL = "http://youtube.stream"
FAKE_ACCESS_TOKEN = "test"
FAKE_ACCOUNT_ID = "123"
FAKE_ACCOUNT_EMAIL = "test@test.com"
FAKE_STREAM_KEY = "key"
FAKE_BROADCAST_KEY = "bcast"
FAKE_STREAM_ID = "stream"
HTTP_OK = 200
HTTP_NO_CONTENT = 204


def require_uuid(value: UUID | None) -> UUID:
    """Narrow optional UUID values produced by Pydantic models."""
    assert value is not None
    return value


def build_user() -> User:
    """Build a user for stream router tests."""
    user = UserFactory.build(
        id=uuid4(),
        email=TEST_EMAIL,
        is_active=True,
        is_verified=True,
        hashed_password=TEST_HASHED_PASSWORD,
    )
    assert user.id is not None
    return user


@pytest.fixture
def mock_user() -> User:
    """Return a mock user for testing."""
    return build_user()


@pytest.fixture
def mock_camera(mock_user: User) -> Camera:
    """Return a mock camera for testing."""
    owner_id = require_uuid(mock_user.id)
    return Camera(
        id=uuid4(),
        name=TEST_CAMERA_NAME,
        description=TEST_CAMERA_DESC,
        relay_public_key_jwk=RelayPublicKeyJWK(
            kty="EC",
            crv="P-256",
            x="x",
            y="y",
            kid="test-key-id",
        ).model_dump(),
        relay_key_id="test-key-id",
        owner_id=owner_id,
    )


def build_stream_config() -> YoutubeStreamConfigWithID:
    """Return a consistent fake YouTube stream configuration."""
    return YoutubeStreamConfigWithID(
        stream_key=SecretStr(FAKE_STREAM_KEY),
        broadcast_key=SecretStr(FAKE_BROADCAST_KEY),
        stream_id=FAKE_STREAM_ID,
    )
