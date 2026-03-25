"""Unit tests for RPi Cam router dependencies."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, call, patch

import pytest

from app.api.auth.exceptions import UserHasNoOrgError, UserIsNotMemberError
from app.api.auth.models import OrganizationRole
from app.api.plugins.rpi_cam.dependencies import get_camera_transfer_owner_id
from app.api.plugins.rpi_cam.exceptions import InvalidCameraOwnershipTransferError
from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.schemas import CameraUpdate
from tests.factories.models import UserFactory


def build_camera(*, owner_id: uuid.UUID) -> Camera:
    """Build a camera instance for dependency tests."""
    return Camera(
        name="Camera",
        owner_id=owner_id,
        encrypted_api_key="encrypted-key",
        url="http://example.com",
    )


async def test_get_camera_transfer_owner_id_returns_none_when_owner_unchanged() -> None:
    """No extra lookup is needed if the request does not include owner_id."""
    session = AsyncMock()
    camera = build_camera(owner_id=uuid.uuid4())
    camera_in = CameraUpdate(name="Updated", auth_headers=None)

    with patch("app.api.plugins.rpi_cam.dependencies.get_model_or_404", new=AsyncMock()) as mock_get_model:
        result = await get_camera_transfer_owner_id(camera_in, camera, session)

    assert result is None
    mock_get_model.assert_not_awaited()


async def test_get_camera_transfer_owner_id_allows_same_org_transfer() -> None:
    """Ownership transfer is allowed within the same organization."""
    session = AsyncMock()
    org_id = uuid.uuid4()
    current_owner = UserFactory.build(
        id=uuid.uuid4(),
        email="owner@example.com",
        hashed_password="hashed",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        organization_id=org_id,
        organization_role=OrganizationRole.OWNER,
    )
    target_owner = UserFactory.build(
        id=uuid.uuid4(),
        email="target@example.com",
        hashed_password="hashed",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        organization_id=org_id,
        organization_role=OrganizationRole.MEMBER,
    )
    camera = build_camera(owner_id=current_owner.db_id)
    camera_in = CameraUpdate.model_validate({"owner_id": target_owner.id})

    with patch(
        "app.api.plugins.rpi_cam.dependencies.get_model_or_404",
        new=AsyncMock(side_effect=[current_owner, target_owner]),
    ) as mock_get_model:
        result = await get_camera_transfer_owner_id(camera_in, camera, session)

    assert result == target_owner.id
    assert mock_get_model.await_args_list == [
        call(session, type(current_owner), current_owner.id),
        call(session, type(target_owner), target_owner.id),
    ]


async def test_get_camera_transfer_owner_id_rejects_null_owner_transfer() -> None:
    """Explicit null ownership changes are rejected."""
    session = AsyncMock()
    camera = build_camera(owner_id=uuid.uuid4())
    camera_in = CameraUpdate.model_validate({"owner_id": None})

    with pytest.raises(InvalidCameraOwnershipTransferError, match="owner_id must reference an existing user"):
        await get_camera_transfer_owner_id(camera_in, camera, session)


async def test_get_camera_transfer_owner_id_rejects_transfer_to_other_org() -> None:
    """Ownership transfer must stay within the same organization."""
    session = AsyncMock()
    current_owner = UserFactory.build(
        id=uuid.uuid4(),
        email="owner@example.com",
        hashed_password="hashed",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        organization_id=uuid.uuid4(),
        organization_role=OrganizationRole.OWNER,
    )
    target_owner = UserFactory.build(
        id=uuid.uuid4(),
        email="other@example.com",
        hashed_password="hashed",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        organization_id=uuid.uuid4(),
        organization_role=OrganizationRole.MEMBER,
    )
    camera = build_camera(owner_id=current_owner.db_id)
    camera_in = CameraUpdate.model_validate({"owner_id": target_owner.id})

    with (
        patch(
            "app.api.plugins.rpi_cam.dependencies.get_model_or_404",
            new=AsyncMock(side_effect=[current_owner, target_owner]),
        ),
        pytest.raises(UserIsNotMemberError),
    ):
        await get_camera_transfer_owner_id(camera_in, camera, session)


async def test_get_camera_transfer_owner_id_rejects_owner_without_org() -> None:
    """Ownership transfer is rejected if the current owner has no organization."""
    session = AsyncMock()
    current_owner = UserFactory.build(
        id=uuid.uuid4(),
        email="owner@example.com",
        hashed_password="hashed",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        organization_id=None,
        organization_role=None,
    )
    target_owner = UserFactory.build(
        id=uuid.uuid4(),
        email="target@example.com",
        hashed_password="hashed",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        organization_id=uuid.uuid4(),
        organization_role=OrganizationRole.MEMBER,
    )
    camera = build_camera(owner_id=current_owner.db_id)
    camera_in = CameraUpdate.model_validate({"owner_id": target_owner.id})

    with (
        patch(
            "app.api.plugins.rpi_cam.dependencies.get_model_or_404",
            new=AsyncMock(side_effect=[current_owner, target_owner]),
        ),
        pytest.raises(UserHasNoOrgError),
    ):
        await get_camera_transfer_owner_id(camera_in, camera, session)
