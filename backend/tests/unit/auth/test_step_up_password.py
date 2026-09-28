"""Tests for step-up re-authentication before changing an authentication method."""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException, status

from app.api.auth.exceptions import RecentSignInRequiredError
from app.api.auth.models import User
from app.api.auth.services.account_security import (
    RECENT_SIGN_IN_WINDOW,
    require_recent_sign_in,
    require_step_up_password,
)
from app.api.common.audit import AuditAction, AuditContext


def _user(*, has_usable_password: bool) -> MagicMock:
    user = MagicMock()
    user.has_usable_password = has_usable_password
    user.hashed_password = "hashed"
    return user


def _password_helper(*, valid: bool) -> MagicMock:
    helper = MagicMock()
    helper.verify_and_update = MagicMock(return_value=(valid, None))
    return helper


def test_missing_password_is_rejected() -> None:
    """Linking or unlinking without the password must be refused, not silently allowed.

    Regression for the gap this closes: ``/oauth/{provider}/associate/authorize`` took no
    credential at all, so a stolen session could attach a provider the attacker controls
    and keep access after the victim reset their password (ASVS V7.5.1).
    """
    with pytest.raises(HTTPException) as exc:
        require_step_up_password(
            password_helper=_password_helper(valid=True),
            user=_user(has_usable_password=True),
            current_password=None,
            action="link a social login",
        )

    assert exc.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "link a social login" in exc.value.detail


def test_wrong_password_is_rejected_and_audited() -> None:
    """A wrong password must not satisfy the step-up, and leaves an audit trail for the account."""
    user = _user(has_usable_password=True)
    with (
        patch("app.api.auth.services.account_security.audit_event") as log_audit,
        pytest.raises(HTTPException) as exc,
    ):
        require_step_up_password(
            password_helper=_password_helper(valid=False),
            user=user,
            current_password="wrong",
            action="link a social login",
        )

    assert exc.value.status_code == status.HTTP_403_FORBIDDEN
    log_audit.assert_called_once_with(
        user.id,
        AuditAction.LOGIN_FAILURE,
        User,
        user.id,
        context=AuditContext(outcome="denied", flow="step_up", reason="invalid_current_password"),
    )


def test_correct_password_is_accepted() -> None:
    """The correct password satisfies the step-up."""
    require_step_up_password(
        password_helper=_password_helper(valid=True),
        user=_user(has_usable_password=True),
        current_password="correct",
        action="link a social login",
    )


def test_oauth_only_account_is_exempt() -> None:
    """An account with no usable password has no password to re-assert.

    Demanding one would make linking impossible for OAuth-only accounts; the out-of-band
    link-changed notification is the compensating control. Mirrors the unlink flow.
    """
    helper = _password_helper(valid=False)

    require_step_up_password(
        password_helper=helper,
        user=_user(has_usable_password=False),
        current_password=None,
        action="link a social login",
    )

    helper.verify_and_update.assert_not_called()


def _passwordless_user(*, last_login_at: datetime | None, mfa_enabled: bool = False) -> MagicMock:
    user = _user(has_usable_password=False)
    user.mfa_enabled = mfa_enabled
    user.last_login_at = last_login_at
    return user


@pytest.mark.parametrize(
    "last_login_at",
    [None, datetime.now(UTC) - RECENT_SIGN_IN_WINDOW - timedelta(minutes=1)],
    ids=["never", "stale"],
)
def test_passwordless_account_without_mfa_needs_a_fresh_sign_in(last_login_at: datetime | None) -> None:
    """With no password and no MFA, the session alone is not enough."""
    with pytest.raises(RecentSignInRequiredError):
        require_recent_sign_in(_passwordless_user(last_login_at=last_login_at))


def test_recent_sign_in_passes() -> None:
    """A sign-in inside the window is fresh enough."""
    require_recent_sign_in(_passwordless_user(last_login_at=datetime.now(UTC) - timedelta(minutes=1)))


@pytest.mark.parametrize("has_password", [True, False])
def test_recent_sign_in_is_not_required_with_another_factor(*, has_password: bool) -> None:
    """A password or MFA step-up already proves the owner is present."""
    user = _passwordless_user(last_login_at=None, mfa_enabled=not has_password)
    user.has_usable_password = has_password
    require_recent_sign_in(user)
