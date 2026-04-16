"""Behavior-focused tests for organization member listing."""
# ruff: noqa: D101, D102

from __future__ import annotations

import uuid
from typing import cast
from unittest.mock import AsyncMock, MagicMock, patch, sentinel

import pytest

from app.api.auth.crud.organizations import get_organization_members
from app.api.auth.exceptions import UserIsNotMemberError
from app.api.auth.models import Organization, User
from app.api.auth.schemas import UserReadPublic
from tests.unit.auth._org_crud_support import make_user

pytestmark = pytest.mark.unit


class TestGetOrganizationMembers:
    async def test_get_members_non_member_raises(self, mock_session: AsyncMock) -> None:
        org_id = uuid.uuid4()
        user = make_user(organization_id=uuid.uuid4())

        with pytest.raises(UserIsNotMemberError):
            await get_organization_members(mock_session, org_id, user)

    async def test_get_members_success_as_member(self, mock_session: AsyncMock) -> None:
        org_id = uuid.uuid4()
        user = make_user(organization_id=org_id)
        mock_members = [MagicMock(), MagicMock()]
        mock_org = MagicMock()
        mock_org.members = mock_members

        with patch("app.api.auth.crud.organizations.require_model", return_value=mock_org):
            result = await get_organization_members(mock_session, org_id, user)

        assert result == mock_members

    async def test_get_members_success_as_superuser(self, mock_session: AsyncMock) -> None:
        org_id = uuid.uuid4()
        user = make_user(is_superuser=True)
        mock_org = MagicMock()
        mock_org.members = [MagicMock()]

        with patch("app.api.auth.crud.organizations.require_model", return_value=mock_org):
            result = await get_organization_members(mock_session, org_id, user)

        members = cast("list[User]", result)
        assert len(members) == 1

    async def test_get_members_paginated_success(self, mock_session: AsyncMock) -> None:
        org_id = uuid.uuid4()
        user = make_user(organization_id=org_id)

        with (
            patch(
                "app.api.auth.crud.organizations.require_model",
                new=AsyncMock(return_value=MagicMock()),
            ) as mock_require_model,
            patch(
                "app.api.auth.crud.organizations.page_organization_members",
                new=AsyncMock(return_value=sentinel.page),
            ) as mock_get_paginated,
        ):
            result = await get_organization_members(
                mock_session,
                org_id,
                user,
                paginate=True,
                read_schema=UserReadPublic,
            )

        assert result == sentinel.page
        mock_require_model.assert_awaited_once_with(
            mock_session,
            Organization,
            org_id,
            loaders=None,
            read_schema=None,
        )
        mock_get_paginated.assert_awaited_once_with(
            mock_session,
            org_id,
            read_schema=UserReadPublic,
        )
