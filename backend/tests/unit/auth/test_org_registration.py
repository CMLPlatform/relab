"""Unit tests for add_user_role_in_organization_after_registration.

Tests the three branches:
  1. No org data in request  → user returned unchanged
  2. organization dict in request → org created, user set as OWNER
  3. organization_id in request → user assigned as MEMBER of existing org
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.api.auth.crud.users import add_user_role_in_organization_after_registration
from app.api.auth.models import OrganizationRole, User
from tests.factories.models import UserFactory


def _make_user() -> User:
    user = UserFactory.build(
        id=uuid.uuid4(),
        email="u@example.com",
        hashed_password="hashed",  # noqa: S106
    )
    user.organization_id = None
    user.organization_role = None
    return user


def _make_session() -> AsyncMock:
    session = AsyncMock()
    session.add = MagicMock()  # session.add() is synchronous in SQLAlchemy
    return session


def _make_user_db(session: AsyncMock) -> MagicMock:
    user_db = MagicMock()
    user_db.session = session
    return user_db


def _make_request(body: dict) -> MagicMock:
    request = MagicMock()
    request.json = AsyncMock(return_value=body)
    return request


@pytest.mark.unit
class TestAddUserRoleInOrganization:
    """add_user_role_in_organization_after_registration branch coverage."""

    async def test_no_org_data_returns_user_unchanged(self) -> None:
        """When the request body has no org fields, the user is returned without modification."""
        session = _make_session()
        user = _make_user()
        user_db = _make_user_db(session)
        request = _make_request({})

        result = await add_user_role_in_organization_after_registration(user_db, user, request)

        assert result is user
        assert result.organization_id is None
        assert result.organization_role is None
        session.add.assert_not_called()
        session.commit.assert_not_called()

    async def test_organization_dict_creates_org_and_sets_owner_role(self) -> None:
        """When 'organization' dict is in request body, a new org is created and user becomes OWNER."""
        session = _make_session()
        user = _make_user()
        user_db = _make_user_db(session)
        org_data = {"name": "ACME Corp", "location": "Berlin"}
        request = _make_request({"organization": org_data})

        with patch("app.api.auth.crud.users.Organization") as mock_org:
            mock_org_instance = MagicMock()
            mock_org_instance.id = uuid.uuid4()
            mock_org.return_value = mock_org_instance

            result = await add_user_role_in_organization_after_registration(user_db, user, request)

        mock_org.assert_called_once_with(**org_data, owner_id=user.id)
        session.add.assert_any_call(mock_org_instance)
        session.flush.assert_awaited_once()
        assert result.organization_role == OrganizationRole.OWNER
        assert result.organization_id == mock_org_instance.id
        session.commit.assert_awaited_once()
        session.refresh.assert_awaited_once_with(user)

    async def test_organization_id_sets_member_role(self) -> None:
        """When 'organization_id' is in request body, user is added as MEMBER (no org created)."""
        session = _make_session()
        user = _make_user()
        user_db = _make_user_db(session)
        org_id = uuid.uuid4()
        request = _make_request({"organization_id": str(org_id)})

        result = await add_user_role_in_organization_after_registration(user_db, user, request)

        assert result.organization_role == OrganizationRole.MEMBER
        assert result.organization_id == str(org_id)
        # No Organization created — flush should not have been called for org creation
        session.flush.assert_not_awaited()
        session.commit.assert_awaited_once()
        session.refresh.assert_awaited_once_with(user)

    async def test_organization_dict_takes_priority_over_organization_id(self) -> None:
        """If both 'organization' and 'organization_id' are present, the dict branch wins."""
        session = _make_session()
        user = _make_user()
        user_db = _make_user_db(session)
        org_id = uuid.uuid4()
        request = _make_request({"organization": {"name": "MyOrg"}, "organization_id": str(org_id)})

        with patch("app.api.auth.crud.users.Organization") as mock_org:
            mock_org_instance = MagicMock()
            mock_org_instance.id = uuid.uuid4()
            mock_org.return_value = mock_org_instance

            result = await add_user_role_in_organization_after_registration(user_db, user, request)

        # Should have taken the org-creation branch, not the member branch
        assert result.organization_role == OrganizationRole.OWNER
        mock_org.assert_called_once()
