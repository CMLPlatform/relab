"""Behavior-focused tests for organization lifecycle CRUD."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch, sentinel

import pytest
from sqlalchemy.exc import IntegrityError

from app.api.auth.crud.organizations import (
    create_organization,
    delete_organization_as_owner,
    force_delete_organization,
    get_organizations,
    update_user_organization,
)
from app.api.auth.exceptions import (
    AlreadyMemberError,
    OrganizationHasMembersError,
    OrganizationNameExistsError,
    UserDoesNotOwnOrgError,
    UserIsNotMemberError,
)
from app.api.auth.models import Organization, OrganizationRole
from app.api.auth.schemas import OrganizationCreate, OrganizationReadPublic, OrganizationUpdate
from tests.factories.models import OrganizationFactory
from tests.unit.auth._org_crud_support import make_user


class TestCreateOrganization:
    """Test organization creation."""

    async def test_create_organization_success(self, mock_session: AsyncMock) -> None:
        """Test that a user can create an org and that they become the owner of the new org."""
        owner = make_user()
        org_create = OrganizationCreate(name="My Org")

        result = await create_organization(mock_session, org_create, owner)

        assert isinstance(result, Organization)
        assert result.name == "My Org"
        assert result.owner_id == owner.id
        mock_session.add.assert_called()
        mock_session.commit.assert_called_once()

    async def test_create_organization_already_member_raises(self, mock_session: AsyncMock) -> None:
        """Test that a user cannot create an org if they are already a member of another org."""
        owner = make_user(organization_id=uuid.uuid4(), organization_role=OrganizationRole.MEMBER)
        org_create = OrganizationCreate(name="New Org")

        with pytest.raises(AlreadyMemberError):
            await create_organization(mock_session, org_create, owner)


class TestGetOrganizations:
    """Test getting organizations."""

    async def test_get_organizations_uses_paginated_helper(self, mock_session: AsyncMock) -> None:
        """Test that the paginate_select helper is used to return a paginated list of orgs."""
        with patch(
            "app.api.auth.crud.organizations.paginate_select",
            new=AsyncMock(return_value=sentinel.page),
        ) as mock_get_paginated:
            result = await get_organizations(mock_session, read_schema=OrganizationReadPublic)

        assert result == sentinel.page
        mock_get_paginated.assert_awaited_once()


class TestUpdateUserOrganization:
    """Test updating organization details as a user with permissions to update the org (owner or superuser)."""

    async def test_update_organization_name_success(self, mock_session: AsyncMock) -> None:
        """Test that an org owner can update the name of their org."""
        org = OrganizationFactory.build(name="Old Name")
        org_update = OrganizationUpdate(name="New Name")

        with patch("app.api.auth.crud.organizations.require_model", new=AsyncMock(return_value=org)):
            result = await update_user_organization(mock_session, org, org_update)

        assert result.name == "New Name"
        mock_session.add.assert_called_once()
        mock_session.commit.assert_called_once()

    async def test_transfer_ownership_success(self, mock_session: AsyncMock) -> None:
        """Test that an org owner can transfer ownership to another member and that the roles are updated."""
        current_owner = make_user(organization_role=OrganizationRole.OWNER)
        new_owner = make_user(organization_role=OrganizationRole.MEMBER)
        org = OrganizationFactory.build(owner_id=current_owner.id)
        org.owner = current_owner
        org.members = [current_owner, new_owner]
        current_owner.organization = org
        new_owner.organization = org

        org_update = OrganizationUpdate(name=org.name, owner_id=new_owner.id)

        with patch("app.api.auth.crud.organizations.require_model", new=AsyncMock(return_value=org)):
            result = await update_user_organization(mock_session, org, org_update)

        assert result.owner_id == new_owner.id
        assert current_owner.organization_role == OrganizationRole.MEMBER
        assert new_owner.organization_role == OrganizationRole.OWNER
        mock_session.add.assert_called_once()
        mock_session.commit.assert_called_once()

    async def test_transfer_ownership_to_non_member_raises(self, mock_session: AsyncMock) -> None:
        """Test that an org owner cannot transfer ownership to a user who is not a member of the org."""
        current_owner = make_user(organization_role=OrganizationRole.OWNER)
        non_member = make_user()
        org = OrganizationFactory.build(owner_id=current_owner.id)
        org.owner = current_owner
        org.members = [current_owner]
        current_owner.organization = org
        non_member.organization = None

        org_update = OrganizationUpdate(name=org.name, owner_id=non_member.id)

        with (
            patch("app.api.auth.crud.organizations.require_model", new=AsyncMock(return_value=org)),
            pytest.raises(UserIsNotMemberError),
        ):
            await update_user_organization(mock_session, org, org_update)


class TestDeleteOrganizationAsOwner:
    """Test deleting an organization as the owner.

    The owner should only be able to delete the org if there are no other members,
    otherwise they would be leaving orphaned members without an org.
    """

    async def test_delete_no_org_raises(self, mock_session: AsyncMock) -> None:
        """Test that a user cannot delete an org if they are not currently part of any org."""
        user = make_user()
        user.organization = None

        with pytest.raises(UserDoesNotOwnOrgError):
            await delete_organization_as_owner(mock_session, user)

    async def test_delete_not_owner_raises(self, mock_session: AsyncMock) -> None:
        """Test that a user cannot delete an org if they are a member but not the owner."""
        org = OrganizationFactory.build()
        object.__setattr__(org, "members", [MagicMock()])
        user = make_user(organization_role=OrganizationRole.MEMBER)
        user.organization = org

        with pytest.raises(UserDoesNotOwnOrgError):
            await delete_organization_as_owner(mock_session, user)

    async def test_delete_with_multiple_members_raises(self, mock_session: AsyncMock) -> None:
        """Test that a user cannot delete an org if they are the owner but there are other members in the org."""
        org = OrganizationFactory.build()
        object.__setattr__(org, "members", [MagicMock(), MagicMock()])
        user = make_user(organization_role=OrganizationRole.OWNER)
        user.organization = org

        with pytest.raises(OrganizationHasMembersError):
            await delete_organization_as_owner(mock_session, user)

    async def test_delete_success(self, mock_session: AsyncMock) -> None:
        """Test that an org owner can delete their org if there are no other members."""
        org = MagicMock()
        org.members = [MagicMock()]
        user = make_user(organization_role=OrganizationRole.OWNER)
        user.organization = org

        await delete_organization_as_owner(mock_session, user)

        mock_session.delete.assert_called_once_with(org)
        mock_session.commit.assert_called_once()


class TestForceDeleteOrganization:
    """Test force deleting an organization.

    This should succeed regardless of the number of members and without requiring an owner user context.
    It would be used by admins to delete orgs that are in a bad state or that they want to remove for any reason.
    """

    async def test_force_delete_success(self, mock_session: AsyncMock) -> None:
        """Test that an org can be force deleted regardless of the number of members or user context."""
        org_id = uuid.uuid4()
        org = OrganizationFactory.build(id=org_id)

        with patch("app.api.auth.crud.organizations.require_model", return_value=org):
            await force_delete_organization(mock_session, org_id)

        mock_session.delete.assert_called_once_with(org)
        mock_session.commit.assert_called_once()


class TestOrganizationIntegrityErrors:
    """Test that integrity errors are properly translated into user-friendly errors for org creation and updates."""

    async def test_create_organization_unique_name_raises(self, mock_session: AsyncMock) -> None:
        """Test that a unique constraint violation on org name during creation raises an OrganizationNameExistsError."""
        owner = make_user()
        org_create = OrganizationCreate(name="My Org")

        mock_orig = MagicMock()
        mock_orig.pgcode = "23505"
        mock_session.flush = AsyncMock(side_effect=IntegrityError("stmt", {}, mock_orig))

        with pytest.raises(OrganizationNameExistsError):
            await create_organization(mock_session, org_create, owner)

    async def test_update_organization_unique_name_raises(self, mock_session: AsyncMock) -> None:
        """Test that a unique constraint violation on org name during update raises an OrganizationNameExistsError."""
        org = OrganizationFactory.build(name="Old Name")
        org_update = OrganizationUpdate(name="Conflict Name")

        mock_orig = MagicMock()
        mock_orig.pgcode = "23505"
        mock_session.flush = AsyncMock(side_effect=IntegrityError("stmt", {}, mock_orig))

        with pytest.raises(OrganizationNameExistsError):
            await update_user_organization(mock_session, org, org_update)
