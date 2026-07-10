"""Unit tests for auth dependency helpers."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException, status
from fastapi_users.exceptions import InvalidID, UserNotExists

from app.api.auth.dependencies import current_mfa_user, get_user_or_404
from app.api.common.exceptions import ForbiddenError


def test_current_mfa_user_returns_mfa_enabled_user() -> None:
    """MFA dependency should pass through users with confirmed MFA enabled."""
    user = MagicMock()
    user.mfa_enabled = True

    assert current_mfa_user(user) is user


def test_current_mfa_user_rejects_user_without_mfa() -> None:
    """MFA dependency should reject active users who have not enabled MFA."""
    user = MagicMock()
    user.mfa_enabled = False

    with pytest.raises(ForbiddenError) as exc_info:
        current_mfa_user(user)

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
