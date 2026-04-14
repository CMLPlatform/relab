"""Unit tests for RPi Cam plugin models."""

from __future__ import annotations

from uuid import uuid4

import pytest

from app.api.plugins.rpi_cam.models import Camera, CameraConnectionStatus, CameraCredentialStatus

HTTP_OK = 200
HTTP_UNAUTHORIZED = 401
HTTP_FORBIDDEN = 403
HTTP_INTERNAL_ERROR = 500
HTTP_SERVICE_UNAVAILABLE = 503

TEST_CAMERA_NAME = "Test Camera"
FETCHED_VAL = "fetched"
CACHED_VAL = "cached"
PUBLIC_JWK = {
    "kty": "EC",
    "crv": "P-256",
    "x": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "y": "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    "kid": "key-12345",
}


def build_camera() -> Camera:
    """Build a camera for model tests."""
    return Camera(
        id=uuid4(),
        name=TEST_CAMERA_NAME,
        description="A test camera",
        relay_public_key_jwk=PUBLIC_JWK,
        relay_key_id="key-12345",
        relay_credential_status=CameraCredentialStatus.ACTIVE,
        owner_id=uuid4(),
    )


class TestCameraConnectionStatus:
    """Test suite for CameraConnectionStatus enum utilities."""

    def test_to_http_error(self) -> None:
        """Test conversion of connection status to HTTP error tuples."""
        assert CameraConnectionStatus.ONLINE.to_http_error() == (HTTP_OK, "Camera is online")
        assert CameraConnectionStatus.OFFLINE.to_http_error() == (HTTP_SERVICE_UNAVAILABLE, "Camera is offline")
        assert CameraConnectionStatus.UNAUTHORIZED.to_http_error() == (
            HTTP_UNAUTHORIZED,
            "Unauthorized access to camera",
        )
        assert CameraConnectionStatus.FORBIDDEN.to_http_error() == (HTTP_FORBIDDEN, "Forbidden access to camera")
        assert CameraConnectionStatus.ERROR.to_http_error() == (HTTP_INTERNAL_ERROR, "Camera access error")


class TestCameraModel:
    """Test suite for the Camera model functionality."""

    @pytest.fixture
    def camera(self) -> Camera:
        """Return a camera instance for testing."""
        return build_camera()

    def test_hash_and_str(self, camera: Camera) -> None:
        """Test string representation and hashing of the camera model."""
        assert hash(camera) == hash(camera.id)
        assert str(camera) == f"{TEST_CAMERA_NAME} (id: {camera.id})"

    def test_credential_is_active(self, camera: Camera) -> None:
        """Test credential status helper."""
        assert camera.credential_is_active is True
        camera.relay_credential_status = CameraCredentialStatus.REVOKED
        assert camera.credential_is_active is False
