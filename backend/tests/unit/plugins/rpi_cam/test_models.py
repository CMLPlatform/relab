"""Unit tests for RPi Cam plugin models."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import httpx
import pytest

from app.api.plugins.rpi_cam.models import Camera, CameraConnectionStatus
from app.api.plugins.rpi_cam.utils.encryption import encrypt_str

# Constants for HTTP status codes
HTTP_OK = 200
HTTP_UNAUTHORIZED = 401
HTTP_FORBIDDEN = 403
HTTP_INTERNAL_ERROR = 500
HTTP_SERVICE_UNAVAILABLE = 503

# Constants for test values
TEST_CAMERA_NAME = "Test Camera"
TEST_API_KEY = "test_api_key"
LOCAL_URL = "http://localhost:8000"
HTTPS_URL = "https://example.com"
BEARER_TOKEN = "Bearer token"
FETCHED_VAL = "fetched"
CACHED_VAL = "cached"

# Header keys
X_API_KEY = "X-API-Key"
AUTHORIZATION = "Authorization"

# Model attribute names for mocking/internal access
AUTH_HEADERS_ATTR = "auth_headers"
VERIFY_SSL_ATTR = "verify_ssl"


def build_camera() -> Camera:
    """Build a camera for model tests."""
    return Camera(
        id=uuid4(),
        name=TEST_CAMERA_NAME,
        description="A test camera",
        url=LOCAL_URL,
        encrypted_api_key=encrypt_str(TEST_API_KEY),
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


# ruff: noqa: SLF001
class TestCameraModel:
    """Test suite for the Camera model functionality."""

    @pytest.fixture
    def camera(self) -> Camera:
        """Return a camera instance for testing."""
        return build_camera()

    def test_camera_auth_headers(self, camera: Camera) -> None:
        """Test authentication header generation and caching."""
        headers = camera.auth_headers
        assert X_API_KEY in headers
        assert headers[X_API_KEY].get_secret_value() == TEST_API_KEY

        camera.set_auth_headers({AUTHORIZATION: BEARER_TOKEN})
        assert camera.encrypted_auth_headers is not None

        # Clear cached property
        if AUTH_HEADERS_ATTR in camera.__dict__:
            del camera.__dict__[AUTH_HEADERS_ATTR]

        headers_with_extra = camera.auth_headers
        assert X_API_KEY in headers_with_extra
        assert AUTHORIZATION in headers_with_extra
        assert headers_with_extra[AUTHORIZATION].get_secret_value() == BEARER_TOKEN

    def test_decrypt_auth_headers(self, camera: Camera) -> None:
        """Test decryption of stored authentication headers."""
        assert camera._decrypt_auth_headers() == {}

        camera.set_auth_headers({"custom": "header"})
        assert camera._decrypt_auth_headers() == {"custom": "header"}

    def test_verify_ssl(self, camera: Camera) -> None:
        """Test SSL verification logic based on URL scheme."""
        # Clear cached property
        if VERIFY_SSL_ATTR in camera.__dict__:
            del camera.__dict__[VERIFY_SSL_ATTR]

        camera.url = "http://localhost"
        assert camera.verify_ssl is False

        if VERIFY_SSL_ATTR in camera.__dict__:
            del camera.__dict__[VERIFY_SSL_ATTR]

        camera.url = HTTPS_URL
        assert camera.verify_ssl is True

    def test_hash_and_str(self, camera: Camera) -> None:
        """Test string representation and hashing of the camera model."""
        assert hash(camera) == hash(camera.id)
        assert str(camera) == f"{TEST_CAMERA_NAME} (id: {camera.id})"

    async def test_fetch_status_online(self, camera: Camera) -> None:
        """Test status fetching when the camera is online."""
        mock_response = MagicMock()
        mock_response.status_code = HTTP_OK
        mock_response.json.return_value = {"focus": 100}
        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response

        status = await camera._fetch_status(mock_client)
        assert status.connection == CameraConnectionStatus.ONLINE
        assert status.details is not None

    async def test_fetch_status_unauthorized(self, camera: Camera) -> None:
        """Test status fetching when access is unauthorized."""
        mock_response = MagicMock()
        mock_response.status_code = HTTP_UNAUTHORIZED
        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response

        status = await camera._fetch_status(mock_client)
        assert status.connection == CameraConnectionStatus.UNAUTHORIZED
        assert status.details is None

    async def test_fetch_status_forbidden(self, camera: Camera) -> None:
        """Test status fetching when access is forbidden."""
        mock_response = MagicMock()
        mock_response.status_code = HTTP_FORBIDDEN
        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response

        status = await camera._fetch_status(mock_client)
        assert status.connection == CameraConnectionStatus.FORBIDDEN
        assert status.details is None

    async def test_fetch_status_error(self, camera: Camera) -> None:
        """Test status fetching when an internal error occurs."""
        mock_response = MagicMock()
        mock_response.status_code = HTTP_INTERNAL_ERROR
        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response

        status = await camera._fetch_status(mock_client)
        assert status.connection == CameraConnectionStatus.ERROR
        assert status.details is None

    async def test_fetch_status_offline(self, camera: Camera) -> None:
        """Test status fetching when the camera is unreachable."""
        mock_client = AsyncMock()
        mock_client.get.side_effect = httpx.RequestError("Connection failed")

        status = await camera._fetch_status(mock_client)
        assert status.connection == CameraConnectionStatus.OFFLINE
        assert status.details is None

    @patch.object(Camera, "_get_cached_status")
    @patch.object(Camera, "_fetch_status")
    async def test_get_status_force_refresh(
        self, mock_fetch: MagicMock, mock_cached: MagicMock, camera: Camera
    ) -> None:
        """Test status retrieval with and without force refresh."""
        mock_client = AsyncMock()
        mock_fetch.return_value = FETCHED_VAL
        mock_cached.return_value = CACHED_VAL

        assert await camera.get_status(mock_client, force_refresh=True) == FETCHED_VAL
        mock_fetch.assert_called_once()
        mock_cached.assert_not_called()

        mock_fetch.reset_mock()
        assert await camera.get_status(mock_client, force_refresh=False) == CACHED_VAL
        mock_cached.assert_called_once()
        mock_fetch.assert_not_called()

    @patch.object(Camera, "_fetch_status")
    async def test_get_cached_status(self, mock_fetch: AsyncMock, camera: Camera) -> None:
        """Test that cached status returns cached values without re-fetching."""
        mock_client = AsyncMock()
        mock_fetch.return_value = FETCHED_VAL

        # First call should fetch from the underlying method
        result1 = await camera._get_cached_status(mock_client)
        assert result1 == FETCHED_VAL
        assert mock_fetch.call_count == 1

        # Second call should return cached value without calling _fetch_status again
        result2 = await camera._get_cached_status(mock_client)
        assert result2 == FETCHED_VAL
        assert mock_fetch.call_count == 1  # Still 1, cache hit
