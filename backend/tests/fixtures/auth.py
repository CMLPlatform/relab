"""Auth/user fixtures shared across integration test tiers."""

import time
from typing import TYPE_CHECKING

import pyotp
import pytest

from app.api.auth.roles import UserRole
from app.api.auth.services.mfa_service import TOTP_DIGITS, TOTP_PERIOD_SECONDS
from scripts.seed.factories.models import UserFactory

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
    """Create a superuser for admin and DB-backed tests.

    Also lab-tier, matching the real maintainer account, so media tests that only
    need "an account allowed to upload" keep working. The two are independent
    privileges: that a superuser is NOT lab by default is asserted directly in
    tests/integration/api/test_upload_role_boundaries.py.
    """
    return await UserFactory.create_async(
        session=db_session,
        is_superuser=True,
        is_active=True,
        role=UserRole.LAB,
        refresh_instance=True,
    )


@pytest.fixture
async def db_lab_user(db_session: AsyncSession) -> User:
    """Create an active lab-tier user for research-file and quota-tier tests."""
    return await UserFactory.create_async(
        session=db_session,
        is_superuser=False,
        is_active=True,
        role=UserRole.LAB,
        refresh_instance=True,
    )


def totp_code(secret: str, *, for_time: int | None = None) -> str:
    """Generate the TOTP code an authenticator app would show at the given time."""
    timestamp = int(time.time()) if for_time is None else for_time
    return pyotp.TOTP(secret, digits=TOTP_DIGITS, interval=TOTP_PERIOD_SECONDS).at(timestamp)
