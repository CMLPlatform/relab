"""Auth/user fixtures shared across integration test tiers."""

import time
from typing import TYPE_CHECKING
from unittest.mock import patch

import pyotp
import pytest

from app.api.auth.roles import UserRole
from app.api.auth.services.mfa_service import TOTP_DIGITS, TOTP_PERIOD_SECONDS
from app.api.common.rate_limiting import Limiter
from scripts.seed.factories.models import UserFactory

if TYPE_CHECKING:
    from collections.abc import Iterator

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

    Lab tier (every superuser holds it, see ck_user_superuser_is_lab) with MFA enrolled,
    which admin powers require. A superuser without MFA is built explicitly where that
    refusal is the point.
    """
    return await UserFactory.create_async(
        session=db_session,
        is_superuser=True,
        is_active=True,
        mfa_enabled=True,
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


@pytest.fixture
def fresh_guess_budget() -> Iterator[None]:
    """Give the per-account guess budget an empty in-memory limiter, enabled even where the client disables limits."""
    with patch("app.api.auth.services.rate_limiter.limiter", new=Limiter(storage_uri="memory://")):
        yield


def totp_code(secret: str, *, for_time: int | None = None) -> str:
    """Generate the TOTP code an authenticator app would show at the given time."""
    timestamp = int(time.time()) if for_time is None else for_time
    return pyotp.TOTP(secret, digits=TOTP_DIGITS, interval=TOTP_PERIOD_SECONDS).at(timestamp)
