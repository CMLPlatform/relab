"""Pytest fixtures for organization integration tests."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from fastapi import FastAPI

from app.api.auth.models import Organization, OrganizationRole, User
from tests.factories.models import OrganizationFactory, UserFactory
from tests.fixtures.client import override_authenticated_user

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession
@pytest.fixture
async def verified_user(db_session: AsyncSession) -> User:
    """Non-superuser verified active user."""
    return await UserFactory.create_async(session=db_session, is_superuser=False, is_active=True, is_verified=True)


@pytest.fixture
async def verified_user_client(
    api_client: AsyncClient, verified_user: User, test_app: FastAPI
) -> AsyncGenerator[AsyncClient]:
    """Authenticated client acting as a verified non-superuser."""
    with override_authenticated_user(test_app, verified_user, optional=False):
        yield api_client


async def create_org_for_user(db_session: AsyncSession, owner: User) -> Organization:
    """Create an organization with a real owner."""
    org = await OrganizationFactory.create_async(session=db_session, owner_id=owner.id)
    owner.organization_id = org.id
    owner.organization_role = OrganizationRole.OWNER
    db_session.add(owner)
    await db_session.flush()
    return org


@pytest.fixture
async def org_with_owner(db_session: AsyncSession, verified_user: User) -> Organization:
    """Create an organization owned by verified_user."""
    return await create_org_for_user(db_session, verified_user)
