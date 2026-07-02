"""Unit tests for RPi Cam plugin models."""

from __future__ import annotations

from app.api.plugins.rpi_cam.models import Camera, CameraConnectionStatus, CameraCredentialStatus

HTTP_OK = 200
HTTP_UNAUTHORIZED = 401
HTTP_FORBIDDEN = 403
HTTP_INTERNAL_ERROR = 500
HTTP_SERVICE_UNAVAILABLE = 503


def test_to_http_error() -> None:
    """Test conversion of connection status to HTTP error tuples."""
    assert CameraConnectionStatus.ONLINE.to_http_error() == (HTTP_OK, "Camera is online")
    assert CameraConnectionStatus.OFFLINE.to_http_error() == (HTTP_SERVICE_UNAVAILABLE, "Camera is offline")
    assert CameraConnectionStatus.UNAUTHORIZED.to_http_error() == (
        HTTP_UNAUTHORIZED,
        "Unauthorized access to camera",
    )
    assert CameraConnectionStatus.FORBIDDEN.to_http_error() == (HTTP_FORBIDDEN, "Forbidden access to camera")
    assert CameraConnectionStatus.ERROR.to_http_error() == (HTTP_INTERNAL_ERROR, "Camera access error")


def test_str(mock_camera: Camera) -> None:
    """Test string representation of the camera model."""
    assert str(mock_camera) == f"{mock_camera.name} (id: {mock_camera.id})"


def test_credential_is_active(mock_camera: Camera) -> None:
    """Test credential status helper."""
    assert mock_camera.credential_is_active is True
    mock_camera.relay_credential_status = CameraCredentialStatus.REVOKED
    assert mock_camera.credential_is_active is False
