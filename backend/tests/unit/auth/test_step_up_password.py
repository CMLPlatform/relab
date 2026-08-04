"""Tests for step-up re-authentication before changing an authentication method."""

from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException, status

from app.api.auth.services.account_security import require_step_up_password


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


def test_wrong_password_is_rejected() -> None:
    """A wrong password must not satisfy the step-up."""
    with pytest.raises(HTTPException) as exc:
        require_step_up_password(
            password_helper=_password_helper(valid=False),
            user=_user(has_usable_password=True),
            current_password="wrong",
            action="link a social login",
        )

    assert exc.value.status_code == status.HTTP_401_UNAUTHORIZED


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
