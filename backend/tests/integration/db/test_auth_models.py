"""Integration tests for auth model persistence and constraints."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from sqlalchemy.exc import IntegrityError

from tests.factories.models import UserFactory

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


pytestmark = pytest.mark.db


async def test_email_uniqueness_is_enforced(db_session: AsyncSession) -> None:
    """The database must reject duplicate email addresses."""
    await UserFactory.create_async(db_session, email="unique@example.com", hashed_password="hashed1")

    with pytest.raises(IntegrityError, match="unique"):
        await UserFactory.create_async(db_session, email="unique@example.com", hashed_password="hashed2")


async def test_username_uniqueness_allows_null_values(db_session: AsyncSession) -> None:
    """Incomplete OAuth users may have null usernames while onboarding is pending."""
    await UserFactory.create_async(db_session, email="null1@example.com", hashed_password="hashed2", username=None)
    await UserFactory.create_async(db_session, email="null2@example.com", hashed_password="hashed3", username=None)


async def test_username_is_unique(db_session: AsyncSession) -> None:
    """The database rejects duplicate usernames."""
    await UserFactory.create_async(
        db_session,
        email="named@example.com",
        username="uniqueuser",
        hashed_password="hashed1",
    )

    with pytest.raises(IntegrityError, match="unique"):
        await UserFactory.create_async(
            db_session,
            email="named2@example.com",
            username="uniqueuser",
            hashed_password="hashed4",
        )
