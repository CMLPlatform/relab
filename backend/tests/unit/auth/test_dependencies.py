"""Unit tests for auth dependency helpers."""

from unittest.mock import MagicMock

import pytest
from fastapi import status

from app.api.auth.dependencies import current_mfa_user
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
