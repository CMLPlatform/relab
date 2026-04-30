"""Unit tests for RPi Cam image capture service helpers."""
# spell-checker: ignore excinfo
# ruff: noqa: ANN401 — shared mock_session fixture is typed as Any by design

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.api.auth.exceptions import UserOwnershipError
from app.api.data_collection.models.product import Product
from app.api.plugins.rpi_cam.exceptions import InvalidCameraResponseError
from app.api.plugins.rpi_cam.services import capture_and_store_image
from tests.unit.plugins.rpi_cam.service_test_support import CAPTURE_TIME

if TYPE_CHECKING:
    from typing import Any


async def test_capture_and_store_image_success(mock_session: Any) -> None:
    """Happy path: Pi returns status=uploaded and the stored Image is fetched by id."""
    image_uuid = uuid4()
    expected_image = MagicMock()
    mock_session.get = AsyncMock(return_value=expected_image)

    with patch("app.api.plugins.rpi_cam.service_runtime.get_user_owned_object") as mock_check_product:
        mock_capture_resp = MagicMock()
        mock_capture_resp.json.return_value = {
            "status": "uploaded",
            "image_id": image_uuid.hex,
            "image_url": "https://backend.example/images/abc.jpg",
            "metadata": {"image_properties": {"capture_time": CAPTURE_TIME}},
        }
        mock_camera_request = AsyncMock(return_value=mock_capture_resp)

        result = await capture_and_store_image(
            session=mock_session,
            camera_request=mock_camera_request,
            product_id=1,
            owner_id=uuid4(),
            description="unit test",
        )

    mock_check_product.assert_awaited_once()
    assert mock_camera_request.await_count == 1
    assert mock_camera_request.await_args is not None
    call_kwargs = mock_camera_request.await_args.kwargs
    assert call_kwargs["endpoint"] == "/captures"
    assert call_kwargs["body"] == {"product_id": 1, "description": "unit test"}
    mock_session.get.assert_awaited_once()
    assert result is expected_image


async def test_capture_raises_when_pi_queued_the_image(mock_session: Any) -> None:
    """A queued Pi response should surface as InvalidCameraResponseError."""
    with patch("app.api.plugins.rpi_cam.service_runtime.get_user_owned_object"):
        mock_capture_resp = MagicMock()
        mock_capture_resp.json.return_value = {
            "status": "queued",
            "image_id": "a" * 32,
            "image_url": None,
            "metadata": {},
        }
        mock_camera_request = AsyncMock(return_value=mock_capture_resp)

        with pytest.raises(InvalidCameraResponseError) as excinfo:
            await capture_and_store_image(
                session=mock_session,
                camera_request=mock_camera_request,
                product_id=1,
                owner_id=uuid4(),
            )

    assert excinfo.value.details is not None
    assert "queued" in excinfo.value.details


async def test_capture_raises_when_image_missing_from_db(mock_session: Any) -> None:
    """If the backend DB has no row for the reported id, surface a clean error."""
    image_uuid = uuid4()
    mock_session.get = AsyncMock(return_value=None)

    with patch("app.api.plugins.rpi_cam.service_runtime.get_user_owned_object"):
        mock_capture_resp = MagicMock()
        mock_capture_resp.json.return_value = {
            "status": "uploaded",
            "image_id": image_uuid.hex,
            "image_url": "https://backend.example/images/abc.jpg",
            "metadata": {},
        }
        mock_camera_request = AsyncMock(return_value=mock_capture_resp)

        with pytest.raises(InvalidCameraResponseError) as excinfo:
            await capture_and_store_image(
                session=mock_session,
                camera_request=mock_camera_request,
                product_id=1,
                owner_id=uuid4(),
            )

    assert excinfo.value.details is not None
    assert "not found" in excinfo.value.details


async def test_capture_rejects_product_not_owned_by_camera_owner(mock_session: Any) -> None:
    """Capture must not attach a camera-owned image to another user's product."""
    owner_id = uuid4()
    foreign_product_id = 1

    with patch("app.api.plugins.rpi_cam.service_runtime.get_user_owned_object") as mock_get_owned:
        mock_get_owned.side_effect = UserOwnershipError(Product, foreign_product_id, owner_id)
        mock_camera_request = AsyncMock()

        with pytest.raises(UserOwnershipError):
            await capture_and_store_image(
                session=mock_session,
                camera_request=mock_camera_request,
                product_id=foreign_product_id,
                owner_id=owner_id,
            )

    mock_camera_request.assert_not_awaited()
