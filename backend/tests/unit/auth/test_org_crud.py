"""Unit tests for organization CRUD operations."""

from __future__ import annotations

import uuid
from typing import cast
from unittest.mock import AsyncMock, MagicMock, patch, sentinel

import pytest
from sqlalchemy.exc import IntegrityError

from app.api.auth.crud.organizations import (
    create_organization,
    delete_organization_as_owner,
    force_delete_organization,
    get_organization_members,
    get_organizations,
    leave_organization,
    update_user_organization,
    user_join_organization,
)
from app.api.auth.exceptions import (
    AlreadyMemberError,
    OrganizationHasMembersError,
    OrganizationNameExistsError,
    UserDoesNotOwnOrgError,
    UserHasNoOrgError,
    UserIsNotMemberError,
    UserOwnsOrgError,
)
from app.api.auth.models import Organization, OrganizationRole, User
from app.api.auth.schemas import OrganizationCreate, OrganizationReadPublic, OrganizationUpdate, UserReadPublic
from tests.factories.models import OrganizationFactory, UserFactory


def _make_session() -> AsyncMock:
    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    session.delete = AsyncMock()
    session.execute = AsyncMock()
    return session


def _make_user(
    organization_id: uuid.UUID | None = None,
    organization_role: OrganizationRole | None = None,
    *,
    is_superuser: bool = False,
) -> User:
    user = UserFactory.build(id=uuid.uuid4(), is_superuser=is_superuser)
    user.organization_id = organization_id
    user.organization_role = organization_role
    user.organization = None
    return user


@pytest.mark.unit
class TestCreateOrganization:
    """Tests for create_organization."""

    async def test_create_organization_success(self) -> None:
        """Test successful organization creation."""
        session = _make_session()
        owner = _make_user()
        org_create = OrganizationCreate(name="My Org")

        result = await create_organization(session, org_create, owner)

        assert isinstance(result, Organization)
        assert result.name == "My Org"
        assert result.owner_id == owner.id
        session.add.assert_called()
        session.commit.assert_called_once()

    async def test_create_organization_already_member_raises(self) -> None:
        """Test that creating an org while already in one raises AlreadyMemberError."""
        session = _make_session()
        owner = _make_user(organization_id=uuid.uuid4(), organization_role=OrganizationRole.MEMBER)
        org_create = OrganizationCreate(name="New Org")

        with pytest.raises(AlreadyMemberError):
            await create_organization(session, org_create, owner)


@pytest.mark.unit
class TestGetOrganizations:
    """Tests for get_organizations."""

    async def test_get_organizations_uses_paginated_helper(self) -> None:
        """Test that the org list helper delegates to the shared pagination helper."""
        session = _make_session()

        with patch(
            "app.api.auth.crud.organizations.get_paginated_models",
            new=AsyncMock(return_value=sentinel.page),
        ) as mock_get_paginated:
            result = await get_organizations(session, read_schema=OrganizationReadPublic)

        assert result == sentinel.page
        mock_get_paginated.assert_awaited_once_with(
            session,
            Organization,
            include_relationships=None,
            model_filter=None,
            read_schema=OrganizationReadPublic,
        )

@pytest.mark.unit
class TestUpdateUserOrganization:
    """Tests for update_user_organization."""

    async def test_update_organization_name_success(self) -> None:
        """Test successful org name update."""
        session = _make_session()
        org = OrganizationFactory.build(name="Old Name")
        org_update = OrganizationUpdate(name="New Name")

        with patch("app.api.auth.crud.organizations.get_model_by_id", new=AsyncMock(return_value=org)):
            result = await update_user_organization(session, org, org_update)

        assert result.name == "New Name"
        session.add.assert_called_once()
        session.commit.assert_called_once()

    async def test_transfer_ownership_success(self) -> None:
        """Test transferring ownership to another org member."""
        session = _make_session()
        current_owner = _make_user(organization_role=OrganizationRole.OWNER)
        new_owner = _make_user(organization_role=OrganizationRole.MEMBER)
        org = OrganizationFactory.build(owner_id=current_owner.id)
        org.owner = current_owner
        org.members = [current_owner, new_owner]
        current_owner.organization = org
        new_owner.organization = org

        org_update = OrganizationUpdate(name=org.name, owner_id=new_owner.id)

        with patch("app.api.auth.crud.organizations.get_model_by_id", new=AsyncMock(return_value=org)):
            result = await update_user_organization(session, org, org_update)

        assert result.owner_id == new_owner.id
        assert current_owner.organization_role == OrganizationRole.MEMBER
        assert new_owner.organization_role == OrganizationRole.OWNER
        session.add.assert_called_once()
        session.commit.assert_called_once()

    async def test_transfer_ownership_to_non_member_raises(self) -> None:
        """Test that ownership cannot be transferred to a non-member."""
        session = _make_session()
        current_owner = _make_user(organization_role=OrganizationRole.OWNER)
        non_member = _make_user()
        org = OrganizationFactory.build(owner_id=current_owner.id)
        org.owner = current_owner
        org.members = [current_owner]
        current_owner.organization = org
        non_member.organization = None

        org_update = OrganizationUpdate(name=org.name, owner_id=non_member.id)

        with (
            patch("app.api.auth.crud.organizations.get_model_by_id", new=AsyncMock(return_value=org)),
            pytest.raises(UserIsNotMemberError),
        ):
            await update_user_organization(session, org, org_update)


@pytest.mark.unit
class TestDeleteOrganizationAsOwner:
    """Tests for delete_organization_as_owner."""

    async def test_delete_no_org_raises(self) -> None:
        """Test that deleting when user has no org raises UserDoesNotOwnOrgError."""
        session = _make_session()
        user = _make_user()
        user.organization = None

        with pytest.raises(UserDoesNotOwnOrgError):
            await delete_organization_as_owner(session, user)

    async def test_delete_not_owner_raises(self) -> None:
        """Test that a non-owner cannot delete the org."""
        session = _make_session()
        org = OrganizationFactory.build()
        org.members = [MagicMock()]
        user = _make_user(organization_role=OrganizationRole.MEMBER)
        user.organization = org

        with pytest.raises(UserDoesNotOwnOrgError):
            await delete_organization_as_owner(session, user)

    async def test_delete_with_multiple_members_raises(self) -> None:
        """Test that deleting org with multiple members raises OrganizationHasMembersError."""
        session = _make_session()
        org = OrganizationFactory.build()
        org.members = [MagicMock(), MagicMock()]
        user = _make_user(organization_role=OrganizationRole.OWNER)
        user.organization = org

        with pytest.raises(OrganizationHasMembersError):
            await delete_organization_as_owner(session, user)

    async def test_delete_success(self) -> None:
        """Test successful org deletion by sole owner."""
        session = _make_session()
        org = MagicMock()
        org.members = [MagicMock()]  # Only the owner themselves (len == 1)
        user = _make_user(organization_role=OrganizationRole.OWNER)
        user.organization = org

        await delete_organization_as_owner(session, user)

        session.delete.assert_called_once_with(org)
        session.commit.assert_called_once()


@pytest.mark.unit
class TestForceDeleteOrganization:
    """Tests for force_delete_organization."""

    async def test_force_delete_success(self) -> None:
        """Test force deleting an org by ID."""
        session = _make_session()
        org_id = uuid.uuid4()
        org = OrganizationFactory.build(id=org_id)

        with patch("app.api.auth.crud.organizations.get_model_or_404", return_value=org):
            await force_delete_organization(session, org_id)

        session.delete.assert_called_once_with(org)
        session.commit.assert_called_once()


@pytest.mark.unit
class TestUserJoinOrganization:
    """Tests for user_join_organization."""

    async def test_join_success(self) -> None:
        """Test successfully joining an org as a member."""
        session = _make_session()
        org = OrganizationFactory.build()
        user = _make_user()

        result = await user_join_organization(session, org, user)

        assert result.organization_role == OrganizationRole.MEMBER
        assert result.organization_id == org.id
        session.add.assert_called_once()
        session.commit.assert_called_once()

    async def test_join_already_owner_raises(self) -> None:
        """Test that org owner cannot join another org."""
        session = _make_session()
        org = OrganizationFactory.build()
        user = _make_user(organization_id=org.id, organization_role=OrganizationRole.OWNER)
        user.organization = org
        org.members = [user, MagicMock()]

        with pytest.raises(UserOwnsOrgError):
            await user_join_organization(session, org, user)

    async def test_join_already_member_raises(self) -> None:
        """Test that already-member cannot join another org."""
        session = _make_session()
        org = OrganizationFactory.build()
        user = _make_user(organization_id=uuid.uuid4(), organization_role=OrganizationRole.MEMBER)

        with pytest.raises(AlreadyMemberError):
            await user_join_organization(session, org, user)

    async def test_owner_can_join_new_org_when_old_org_has_no_other_members(self) -> None:
        """Test that an owner can join a new org if their current org is empty apart from them."""
        session = _make_session()
        current_org = OrganizationFactory.build()
        target_org = OrganizationFactory.build()
        user = _make_user(organization_id=current_org.id, organization_role=OrganizationRole.OWNER)
        user.organization = current_org
        current_org.members = [user]

        result = await user_join_organization(session, target_org, user)

        assert result.organization_id == target_org.id
        assert result.organization_role == OrganizationRole.MEMBER
        session.exec.assert_awaited_once()
        session.flush.assert_awaited_once()
        session.commit.assert_awaited_once()


@pytest.mark.unit
class TestGetOrganizationMembers:
    """Tests for get_organization_members."""

    async def test_get_members_non_member_raises(self) -> None:
        """Test that a user from a different org cannot list members."""
        session = _make_session()
        org_id = uuid.uuid4()
        user = _make_user(organization_id=uuid.uuid4())  # Different org

        with pytest.raises(UserIsNotMemberError):
            await get_organization_members(session, org_id, user)

    async def test_get_members_success_as_member(self) -> None:
        """Test that an org member can list members."""
        session = _make_session()
        org_id = uuid.uuid4()
        user = _make_user(organization_id=org_id)
        mock_members = [MagicMock(), MagicMock()]
        mock_org = MagicMock()
        mock_org.members = mock_members

        with patch("app.api.auth.crud.organizations.get_model_by_id", return_value=mock_org):
            result = await get_organization_members(session, org_id, user)

        assert result == mock_members

    async def test_get_members_success_as_superuser(self) -> None:
        """Test that a superuser can list members of any org."""
        session = _make_session()
        org_id = uuid.uuid4()
        user = _make_user(is_superuser=True)
        mock_org = MagicMock()
        mock_org.members = [MagicMock()]

        with patch("app.api.auth.crud.organizations.get_model_by_id", return_value=mock_org):
            result = await get_organization_members(session, org_id, user)

        members = cast("list[User]", result)
        assert len(members) == 1

    async def test_get_members_paginated_success(self) -> None:
        """Test that pagination can be enabled for organization members."""
        session = _make_session()
        org_id = uuid.uuid4()
        user = _make_user(organization_id=org_id)

        with (
            patch(
                "app.api.auth.crud.organizations.get_model_by_id",
                new=AsyncMock(return_value=MagicMock()),
            ) as mock_get_model_by_id,
            patch(
                "app.api.auth.crud.organizations.get_paginated_models",
                new=AsyncMock(return_value=sentinel.page),
            ) as mock_get_paginated,
        ):
            result = await get_organization_members(
                session,
                org_id,
                user,
                paginate=True,
                read_schema=UserReadPublic,
            )

        assert result == sentinel.page
        mock_get_model_by_id.assert_awaited_once_with(session, Organization, org_id)
        mock_get_paginated.assert_awaited_once()


@pytest.mark.unit
class TestLeaveOrganization:
    """Tests for leave_organization."""

    async def test_leave_success(self) -> None:
        """Test successfully leaving an org."""
        session = _make_session()
        user = _make_user(organization_id=uuid.uuid4(), organization_role=OrganizationRole.MEMBER)

        result = await leave_organization(session, user)

        assert result.organization_id is None
        assert result.organization_role is None
        session.add.assert_called_once()
        session.commit.assert_called_once()

    async def test_leave_no_org_raises(self) -> None:
        """Test that leaving when not in any org raises UserHasNoOrgError."""
        session = _make_session()
        user = _make_user()

        with pytest.raises(UserHasNoOrgError):
            await leave_organization(session, user)

    async def test_leave_as_owner_raises(self) -> None:
        """Test that org owner cannot leave without transferring ownership."""
        session = _make_session()
        user = _make_user(organization_id=uuid.uuid4(), organization_role=OrganizationRole.OWNER)

        with pytest.raises(UserOwnsOrgError):
            await leave_organization(session, user)


@pytest.mark.unit
class TestCreateOrganizationIntegrityError:
    """Tests for IntegrityError handling in organization CRUD."""

    async def test_create_organization_unique_name_raises(self) -> None:
        """Test that IntegrityError with unique violation raises OrganizationNameExistsError."""
        session = _make_session()
        owner = _make_user()
        org_create = OrganizationCreate(name="My Org")

        mock_orig = MagicMock()
        mock_orig.pgcode = "23505"
        session.flush = AsyncMock(side_effect=IntegrityError("stmt", {}, mock_orig))

        with pytest.raises(OrganizationNameExistsError):
            await create_organization(session, org_create, owner)

    async def test_update_organization_unique_name_raises(self) -> None:
        """Test that IntegrityError with unique violation on update raises OrganizationNameExistsError."""
        session = _make_session()
        org = OrganizationFactory.build(name="Old Name")
        org_update = OrganizationUpdate(name="Conflict Name")

        mock_orig = MagicMock()
        mock_orig.pgcode = "23505"
        session.flush = AsyncMock(side_effect=IntegrityError("stmt", {}, mock_orig))

        with pytest.raises(OrganizationNameExistsError):
            await update_user_organization(session, org, org_update)
