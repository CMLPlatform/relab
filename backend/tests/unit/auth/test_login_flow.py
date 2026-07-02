"""Unit tests for auth login flow orchestration."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException, Response, status
from fastapi_users.router.common import ErrorCode

from app.api.auth.models import User
from app.api.auth.schemas import MfaPendingResponse, RefreshTokenResponse
from app.api.auth.services import login_flow
from app.api.common.audit import AuditAction, AuditContext


async def test_authenticate_first_factor_audits_bad_credentials() -> None:
    """Invalid first-factor credentials should emit the stable failure audit event."""
    credentials = MagicMock()
    user_manager = MagicMock()
    user_manager.authenticate = AsyncMock(return_value=None)

    with (
        patch("app.api.auth.services.login_flow.audit_event") as audit_event,
        pytest.raises(HTTPException) as exc_info,
    ):
        await login_flow.authenticate_first_factor(credentials, user_manager, "bearer")

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert exc_info.value.detail == ErrorCode.LOGIN_BAD_CREDENTIALS
    audit_event.assert_called_once_with(
        None,
        AuditAction.LOGIN_FAILURE,
        "auth",
        "credentials",
        context=AuditContext(outcome="denied", transport="bearer", reason="bad_credentials"),
    )


async def test_complete_bearer_login_returns_mfa_pending_when_enabled() -> None:
    """MFA-enabled bearer logins should defer token issuance and return 202."""
    user = MagicMock()
    user.mfa_enabled = True
    response = Response()
    pending = MfaPendingResponse(mfa_token="pending-token")

    with patch(
        "app.api.auth.services.login_flow.login_completion.create_mfa_pending_response",
        new=AsyncMock(return_value=pending),
    ):
        result = await login_flow.complete_bearer_login(
            response=response,
            user=user,
            user_manager=MagicMock(),
            redis=MagicMock(),
            bearer_strategy=MagicMock(),
        )

    assert response.status_code == status.HTTP_202_ACCEPTED
    assert result == pending


async def test_complete_session_login_sets_success_audit_after_cookie_issue() -> None:
    """Non-MFA session login should issue cookies and audit the successful login."""
    user = MagicMock()
    user.id = "user-id"
    user.mfa_enabled = False
    response = Response()

    with (
        patch(
            "app.api.auth.services.login_flow.login_completion.issue_session_login_response",
            new=AsyncMock(return_value=None),
        ) as issue_session_login_response,
        patch("app.api.auth.services.login_flow.audit_event") as audit_event,
    ):
        result = await login_flow.complete_session_login(
            response=response,
            user=user,
            user_manager=MagicMock(),
            redis=MagicMock(),
            cookie_strategy=MagicMock(),
        )

    assert result is None
    issue_session_login_response.assert_awaited_once()
    audit_event.assert_called_once_with(
        user.id,
        AuditAction.LOGIN_SUCCESS,
        User,
        user.id,
        context=AuditContext(transport="session"),
    )


async def test_complete_bearer_login_returns_refresh_token_response() -> None:
    """Non-MFA bearer login should return the token response and audit success."""
    user = MagicMock()
    user.id = "user-id"
    user.mfa_enabled = False
    token_response = RefreshTokenResponse(
        access_token="access-token",
        refresh_token="refresh-token",
        token_type="bearer",
        expires_in=60,
    )

    with (
        patch(
            "app.api.auth.services.login_flow.login_completion.issue_bearer_login_response",
            new=AsyncMock(return_value=token_response),
        ),
        patch("app.api.auth.services.login_flow.audit_event") as audit_event,
    ):
        result = await login_flow.complete_bearer_login(
            response=Response(),
            user=user,
            user_manager=MagicMock(),
            redis=MagicMock(),
            bearer_strategy=MagicMock(),
        )

    assert result == token_response
    audit_event.assert_called_once_with(
        user.id,
        AuditAction.LOGIN_SUCCESS,
        User,
        user.id,
        context=AuditContext(transport="bearer"),
    )
