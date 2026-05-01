"""Unit tests for auth router composition."""

from __future__ import annotations

import hashlib
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import BackgroundTasks, HTTPException
from fastapi.routing import APIRoute
from fastapi_users import exceptions
from fastapi_users.router.reset import ErrorCode
from starlette.requests import Request

from app.api.auth.routers.auth import FORGOT_PASSWORD_PATH, RESET_PASSWORD_PATH, router
from app.api.auth.routers.password_reset import (
    _password_reset_identifier_rate_limit_key,
    forgot_password,
    reset_password,
)
from app.api.auth.services.rate_limiter import PASSWORD_RESET_RATE_LIMIT


def _request() -> Request:
    """Build a minimal request object for direct endpoint tests."""
    return Request({"type": "http", "method": "POST", "path": "/auth/forgot-password", "headers": []})


def test_forgot_password_route_is_rate_limited() -> None:
    """The password-reset e-mail request endpoint should be wrapped by the limiter."""
    route = next(
        route for route in router.routes if isinstance(route, APIRoute) and route.path == f"/auth{FORGOT_PASSWORD_PATH}"
    )

    assert hasattr(route.endpoint, "__wrapped__")


def test_reset_password_route_is_rate_limited() -> None:
    """The password-reset submission endpoint should be wrapped by the limiter."""
    route = next(
        route for route in router.routes if isinstance(route, APIRoute) and route.path == f"/auth{RESET_PASSWORD_PATH}"
    )

    assert hasattr(route.endpoint, "__wrapped__")


def test_forgot_password_account_rate_limit_key_hashes_normalized_email() -> None:
    """Forgot-password account buckets should not expose raw submitted addresses."""
    key = _password_reset_identifier_rate_limit_key(" User@Example.COM ")
    expected_digest = hashlib.sha256(b"user@example.com").hexdigest()

    assert key == f"auth:password-reset:account:{expected_digest}"
    assert "User@Example.COM" not in key
    assert "user@example.com" not in key


async def test_forgot_password_applies_account_rate_limit_to_all_requests() -> None:
    """The account-hash limiter should run before account lookup."""
    user_manager = MagicMock()
    user_manager.get_by_email = AsyncMock(side_effect=exceptions.UserNotExists)

    with (
        patch("app.api.auth.routers.password_reset.limiter") as mock_limiter,
        patch("app.api.auth.routers.password_reset._sleep_until_minimum_elapsed", new_callable=AsyncMock),
    ):
        await forgot_password(
            request=_request(),
            email=" User@Example.COM ",
            background_tasks=MagicMock(spec=BackgroundTasks),
            user_manager=user_manager,
        )

    mock_limiter.hit_key.assert_called_once()
    rate, key = mock_limiter.hit_key.call_args.args
    assert rate == PASSWORD_RESET_RATE_LIMIT
    assert key.startswith("auth:password-reset:account:")
    assert "User@Example.COM" not in key
    assert "user@example.com" not in key


@pytest.mark.parametrize(
    ("lookup_side_effect", "forgot_side_effect"),
    [
        (exceptions.UserNotExists, None),
        (None, exceptions.UserInactive),
    ],
)
async def test_forgot_password_returns_same_response_for_missing_and_inactive_users(
    lookup_side_effect: type[Exception] | None,
    forgot_side_effect: type[Exception] | None,
) -> None:
    """Missing and inactive accounts should receive the same accepted response."""
    user = MagicMock()
    user_manager = MagicMock()
    user_manager.get_by_email = (
        AsyncMock(side_effect=lookup_side_effect) if lookup_side_effect else AsyncMock(return_value=user)
    )
    user_manager.forgot_password = AsyncMock(side_effect=forgot_side_effect)

    with (
        patch("app.api.auth.routers.password_reset.limiter"),
        patch("app.api.auth.routers.password_reset._sleep_until_minimum_elapsed", new_callable=AsyncMock),
    ):
        result = await forgot_password(
            request=_request(),
            email="user@example.com",
            background_tasks=MagicMock(spec=BackgroundTasks),
            user_manager=user_manager,
        )

    assert result is None


async def test_forgot_password_existing_user_passes_background_tasks_through_request_state() -> None:
    """Existing-user forgot-password requests should queue reset email work in background tasks."""
    user = MagicMock()
    user_manager = MagicMock()
    user_manager.get_by_email = AsyncMock(return_value=user)
    user_manager.forgot_password = AsyncMock()
    background_tasks = MagicMock(spec=BackgroundTasks)

    with (
        patch("app.api.auth.routers.password_reset.limiter"),
        patch("app.api.auth.routers.password_reset._sleep_until_minimum_elapsed", new_callable=AsyncMock),
    ):
        await forgot_password(
            request=_request(),
            email="user@example.com",
            background_tasks=background_tasks,
            user_manager=user_manager,
        )

    assert user_manager.forgot_password.await_args is not None
    request = user_manager.forgot_password.await_args.args[1]
    assert request.state.background_tasks is background_tasks


async def test_reset_password_preserves_fastapi_users_bad_token_error_shape() -> None:
    """The local reset route should keep FastAPI-Users' public bad-token error shape."""
    user_manager = MagicMock()
    user_manager.reset_password = AsyncMock(side_effect=exceptions.InvalidResetPasswordToken)

    with pytest.raises(HTTPException) as exc_info:
        await reset_password(
            request=_request(),
            token="bad",
            password="new-password-123",
            user_manager=user_manager,
        )

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == ErrorCode.RESET_PASSWORD_BAD_TOKEN
