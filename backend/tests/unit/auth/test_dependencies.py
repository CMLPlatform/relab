"""Unit tests for auth dependency helpers."""

from typing import TYPE_CHECKING, Annotated
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.testclient import TestClient
from fastapi_users.exceptions import InvalidID, UserNotExists

from app.api.auth.dependencies import current_lab_user, current_mfa_user, get_user_or_404
from app.api.auth.roles import UserRole
from app.api.auth.services.user_database import UserDatabaseAsync
from app.api.auth.services.user_manager import get_user_db
from app.api.common.exceptions import ForbiddenError
from app.api.common.routers.dependencies import AsyncSessionDep
from app.core.database import get_async_session

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator


@pytest.mark.asyncio
async def test_current_mfa_user_returns_mfa_enabled_user() -> None:
    """MFA dependency should pass through users with confirmed MFA enabled."""
    user = MagicMock()
    user.mfa_enabled = True

    assert await current_mfa_user(user) is user


@pytest.mark.asyncio
async def test_current_mfa_user_rejects_user_without_mfa() -> None:
    """MFA dependency should reject active users who have not enabled MFA."""
    user = MagicMock()
    user.mfa_enabled = False

    with pytest.raises(ForbiddenError) as exc_info:
        await current_mfa_user(user)

    assert exc_info.value.http_status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_current_lab_user_returns_lab_account() -> None:
    """The lab dependency should pass a lab-tier account through untouched."""
    user = MagicMock()
    user.role = UserRole.LAB

    assert await current_lab_user(user) is user


@pytest.mark.asyncio
async def test_current_lab_user_rejects_contributor() -> None:
    """A contributor must be refused, since the tier is what gates research files."""
    user = MagicMock()
    user.role = UserRole.CONTRIBUTOR

    with pytest.raises(ForbiddenError) as exc_info:
        await current_lab_user(user)

    assert exc_info.value.http_status_code == status.HTTP_403_FORBIDDEN


class TestGetUserOr404:
    """The shared admin lookup dependency maps fastapi-users errors to 404."""

    async def test_returns_the_user_when_found(self) -> None:
        """A resolvable id returns the loaded user."""
        user = MagicMock()
        user_manager = MagicMock()
        user_id = uuid4()
        user_manager.get = AsyncMock(return_value=user)

        assert await get_user_or_404(user_id, user_manager) is user
        user_manager.get.assert_awaited_once_with(user_id)

    # Regression: a missing id used to escape as UserNotExists → catch-all 500.
    async def test_missing_user_raises_404(self) -> None:
        """A missing user maps to 404, not the catch-all 500."""
        user_manager = MagicMock()
        user_manager.get = AsyncMock(side_effect=UserNotExists())

        with pytest.raises(HTTPException) as exc_info:
            await get_user_or_404(uuid4(), user_manager)
        assert exc_info.value.status_code == status.HTTP_404_NOT_FOUND

    async def test_invalid_id_raises_404(self) -> None:
        """A malformed id maps to 404 as well."""
        user_manager = MagicMock()
        user_manager.get = AsyncMock(side_effect=InvalidID())

        with pytest.raises(HTTPException) as exc_info:
            await get_user_or_404(uuid4(), user_manager)
        assert exc_info.value.status_code == status.HTTP_404_NOT_FOUND


def test_user_db_shares_the_request_session() -> None:
    """An authenticated route that also takes AsyncSessionDep must open one session, not two.

    Two sessions per request hold two pool connections, and under load the pool deadlocks on
    requests that each wait for their second connection.
    """
    opened: list[object] = []

    async def counting_session() -> AsyncGenerator[object]:
        session = object()
        opened.append(session)
        yield session

    app = FastAPI()

    @app.get("/probe")
    async def probe(
        session: AsyncSessionDep,
        user_db: Annotated[UserDatabaseAsync, Depends(get_user_db)],
    ) -> bool:
        return user_db.session is session

    app.dependency_overrides[get_async_session] = counting_session
    response = TestClient(app).get("/probe")

    assert response.json() is True
    assert len(opened) == 1
