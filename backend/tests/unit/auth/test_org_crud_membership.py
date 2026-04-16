"""Behavior-focused tests for organization membership changes."""
# ruff: noqa: D101, D102

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.api.auth.crud.organizations import leave_organization, user_join_organization
from app.api.auth.exceptions import AlreadyMemberError, UserHasNoOrgError, UserOwnsOrgError
from app.api.auth.models import OrganizationRole
from tests.factories.models import OrganizationFactory
from tests.unit.auth._org_crud_support import make_user

pytestmark = pytest.mark.unit


class TestUserJoinOrganization:
    async def test_join_success(self, mock_session: AsyncMock) -> None:
        org = OrganizationFactory.build()
        user = make_user()

        result = await user_join_organization(mock_session, org, user)

        assert result.organization_role == OrganizationRole.MEMBER
        assert result.organization_id == org.id
        mock_session.add.assert_called_once()
        mock_session.commit.assert_called_once()

    async def test_join_already_owner_raises(self, mock_session: AsyncMock) -> None:
        org = OrganizationFactory.build()
        user = make_user(organization_id=org.id, organization_role=OrganizationRole.OWNER)
        user.organization = org
        org.members = [user, MagicMock()]

        with pytest.raises(UserOwnsOrgError):
            await user_join_organization(mock_session, org, user)

    async def test_join_already_member_raises(self, mock_session: AsyncMock) -> None:
        org = OrganizationFactory.build()
        user = make_user(organization_id=uuid.uuid4(), organization_role=OrganizationRole.MEMBER)

        with pytest.raises(AlreadyMemberError):
            await user_join_organization(mock_session, org, user)

    async def test_owner_can_join_new_org_when_old_org_has_no_other_members(self, mock_session: AsyncMock) -> None:
        current_org = OrganizationFactory.build()
        target_org = OrganizationFactory.build()
        user = make_user(organization_id=current_org.id, organization_role=OrganizationRole.OWNER)
        user.organization = current_org
        current_org.members = [user]

        result = await user_join_organization(mock_session, target_org, user)

        assert result.organization_id == target_org.id
        assert result.organization_role == OrganizationRole.MEMBER
        mock_session.execute.assert_awaited_once()
        mock_session.flush.assert_awaited_once()
        mock_session.commit.assert_awaited_once()


class TestLeaveOrganization:
    async def test_leave_success(self, mock_session: AsyncMock) -> None:
        user = make_user(organization_id=uuid.uuid4(), organization_role=OrganizationRole.MEMBER)

        result = await leave_organization(mock_session, user)

        assert result.organization_id is None
        assert result.organization_role is None
        mock_session.add.assert_called_once()
        mock_session.commit.assert_called_once()

    async def test_leave_no_org_raises(self, mock_session: AsyncMock) -> None:
        user = make_user()

        with pytest.raises(UserHasNoOrgError):
            await leave_organization(mock_session, user)

    async def test_leave_as_owner_raises(self, mock_session: AsyncMock) -> None:
        user = make_user(organization_id=uuid.uuid4(), organization_role=OrganizationRole.OWNER)

        with pytest.raises(UserOwnsOrgError):
            await leave_organization(mock_session, user)
