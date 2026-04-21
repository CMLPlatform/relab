"""Auth/user fixtures shared across integration test tiers."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from tests.factories.models import UserFactory

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User


@pytest.fixture
async def db_user(db_session: AsyncSession) -> User:
    """Create a standard active user for authenticated tests."""
    return await UserFactory.create_async(
        session=db_session,
        is_superuser=False,
        is_active=True,
        refresh_instance=True,
    )


@pytest.fixture
async def db_superuser(db_session: AsyncSession) -> User:
    """Create a superuser for admin and DB-backed tests."""
    return await UserFactory.create_async(
        session=db_session,
        is_superuser=True,
        is_active=True,
        refresh_instance=True,
    )
