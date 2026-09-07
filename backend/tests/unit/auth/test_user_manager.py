"""Unit tests for username/email login resolution in the UserManager service."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi_users.jwt import decode_jwt, generate_jwt
from fastapi_users.manager import BaseUserManager
from jwt import InvalidAudienceError
from pydantic import SecretStr

from app.api.auth.models import User
from app.api.auth.schemas import UserUpdate
from app.api.auth.services.user_manager import (
    RESET_PASSWORD_TOKEN_AUDIENCE,
    SECRET,
    VERIFICATION_TOKEN_AUDIENCE,
    UserManager,
)
from app.api.auth.terms import CURRENT_TERMS_VERSION
from app.api.common.audit import AuditAction
from app.api.common.rate_limiting import RateLimitExceededError
from app.core.runtime import AppServices


def _make_credentials(username: str, password: str = "testpassword") -> OAuth2PasswordRequestForm:
    form = MagicMock(spec=OAuth2PasswordRequestForm)
    form.username = username
    form.password = password
    return form


def _make_manager(mock_user: MagicMock | None = None) -> tuple[UserManager, AsyncMock]:
    """Return a UserManager with a mocked user_db.session."""
    mock_scalars = MagicMock()
    mock_scalars.unique.return_value.one_or_none.return_value = mock_user

    mock_result = MagicMock()
    mock_result.scalars.return_value = mock_scalars

    mock_session = MagicMock()
    mock_session.execute = AsyncMock(return_value=mock_result)

    mock_user_db = MagicMock()
    mock_user_db.session = mock_session

    manager = UserManager.__new__(UserManager)
    manager.user_db = mock_user_db
    manager.password_helper = MagicMock()

    return manager, mock_session


async def test_applies_account_aware_rate_limit_before_lookup() -> None:
    """Login attempts should also be bucketed by a keyed digest of the submitted identifier."""
    manager, mock_session = _make_manager()
    credentials = _make_credentials(" User@Example.COM ")

    with (
        patch("app.api.auth.services.user_manager.limiter", create=True) as mock_limiter,
        patch.object(BaseUserManager, "authenticate", new_callable=AsyncMock) as mock_super,
    ):
        mock_limiter.ahit_key = AsyncMock()
        mock_super.return_value = None
        await manager.authenticate(credentials)

    mock_limiter.ahit_key.assert_called_once()
    rate, key = mock_limiter.ahit_key.call_args.args
    assert rate == "3/minute"
    assert key.startswith("auth:login:account:")
    assert "user@example.com" not in key
    mock_session.execute.assert_not_called()


async def test_account_rate_limit_exceeded_skips_lookup() -> None:
    """A blocked account bucket should stop work before DB or password checks."""
    manager, mock_session = _make_manager()
    credentials = _make_credentials("blocked@example.com")

    with patch("app.api.auth.services.user_manager.limiter", create=True) as mock_limiter:
        mock_limiter.ahit_key.side_effect = RateLimitExceededError
        with pytest.raises(RateLimitExceededError):
            await manager.authenticate(credentials)

    mock_session.execute.assert_not_called()


async def test_email_input_skips_db_lookup() -> None:
    """When credentials contain '@', no DB query is made and the email is passed through unchanged."""
    manager, mock_session = _make_manager()
    credentials = _make_credentials("user@example.com")

    with patch.object(BaseUserManager, "authenticate", new_callable=AsyncMock) as mock_super:
        mock_super.return_value = None
        await manager.authenticate(credentials)

    mock_session.execute.assert_not_called()
    mock_super.assert_called_once_with(credentials)
    assert credentials.username == "user@example.com"


async def test_username_found_replaces_with_email() -> None:
    """When a user is found by username, credentials.username is replaced with their email."""
    mock_user = MagicMock()
    mock_user.email = "resolved@example.com"

    manager, mock_session = _make_manager(mock_user=mock_user)
    credentials = _make_credentials("myusername")

    with patch.object(BaseUserManager, "authenticate", new_callable=AsyncMock) as mock_super:
        mock_super.return_value = mock_user
        await manager.authenticate(credentials)

    mock_session.execute.assert_called_once()
    assert credentials.username == "resolved@example.com"
    mock_super.assert_called_once_with(credentials)


async def test_username_not_found_passes_original() -> None:
    """When no user matches the username, credentials are passed unchanged to the parent."""
    manager, mock_session = _make_manager(mock_user=None)
    credentials = _make_credentials("nonexistent_user")

    with patch.object(BaseUserManager, "authenticate", new_callable=AsyncMock) as mock_super:
        mock_super.return_value = None
        await manager.authenticate(credentials)

    mock_session.execute.assert_called_once()
    assert credentials.username == "nonexistent_user"
    mock_super.assert_called_once_with(credentials)


async def test_username_and_email_login_share_rate_limit_bucket() -> None:
    """A username and its resolved email must land in the same rate-limit bucket."""
    mock_user = MagicMock()
    mock_user.email = "shared@example.com"

    username_manager, _ = _make_manager(mock_user=mock_user)
    with (
        patch("app.api.auth.services.user_manager.limiter", create=True) as username_limiter,
        patch.object(BaseUserManager, "authenticate", new_callable=AsyncMock),
    ):
        username_limiter.ahit_key = AsyncMock()
        await username_manager.authenticate(_make_credentials("myusername"))
    username_key = username_limiter.ahit_key.call_args.args[1]

    email_manager, _ = _make_manager()
    with (
        patch("app.api.auth.services.user_manager.limiter", create=True) as email_limiter,
        patch.object(BaseUserManager, "authenticate", new_callable=AsyncMock),
    ):
        email_limiter.ahit_key = AsyncMock()
        await email_manager.authenticate(_make_credentials("shared@example.com"))
    email_key = email_limiter.ahit_key.call_args.args[1]

    assert username_key == email_key


def test_current_password_is_not_in_forwarded_update_dicts() -> None:
    """The reauthentication-only field must not be persisted onto the User model."""
    update = UserUpdate(email="new@example.com", current_password=SecretStr("current-passphrase-42"))

    assert "current_password" not in update.create_update_dict()
    assert "current_password" not in update.create_update_dict_superuser()


async def test_email_update_revokes_sessions_before_email_side_effects() -> None:
    """Refresh sessions should be revoked even if a later email side effect fails."""
    manager, _ = _make_manager()
    request = MagicMock()
    user = MagicMock()
    user.email = "old@example.com"
    updated_user = MagicMock()
    updated_user.id = "user-id"
    updated_user.email = "new@example.com"
    update = UserUpdate(email="new@example.com", current_password=SecretStr("current-passphrase-42"))
    calls: list[str] = []

    manager.request_verify = AsyncMock(side_effect=lambda *_args: calls.append("request_verify"))

    async def update_override_side_effect(*_args: object) -> UserUpdate:
        return update

    async def base_update_side_effect(*_args: object, **_kwargs: object) -> MagicMock:
        calls.append("base_update")
        return updated_user

    async def revoke_side_effect(*_args: object) -> None:
        calls.append("revoke")

    async def email_notification_side_effect(*_args: object) -> None:
        calls.append("email_notification")

    with (
        patch(
            "app.api.auth.services.user_manager.update_user_override",
            side_effect=update_override_side_effect,
        ),
        patch.object(BaseUserManager, "update", side_effect=base_update_side_effect),
        patch(
            "app.api.auth.services.user_manager.revoke_user_refresh_tokens",
            side_effect=revoke_side_effect,
        ) as revoke,
        patch("app.api.auth.services.user_manager.require_current_password_for_sensitive_update"),
        patch(
            "app.api.auth.services.user_manager.send_email_changed_notification",
            side_effect=email_notification_side_effect,
        ),
    ):
        result = await manager.update(update, user, request=request)

    assert result is updated_user
    revoke.assert_awaited_once_with(updated_user.id, request)
    assert calls == ["base_update", "revoke", "request_verify", "email_notification"]


async def test_self_service_update_requires_the_current_password() -> None:
    """`PATCH /users/me` (safe=True) must reauthenticate before a sensitive change."""
    manager, _ = _make_manager()
    user = MagicMock()
    user.email = "old@example.com"
    update = UserUpdate(email="new@example.com")  # the user supplied no current_password

    with pytest.raises(HTTPException) as exc_info:
        await manager.update(update, user, safe=True, request=MagicMock())

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST


async def test_superuser_update_does_not_require_the_target_password() -> None:
    """`PATCH /admin/users/{user_id}` (safe=False) must not demand a password the admin cannot know.

    Regression: the reauth gate ran on both paths, so every admin-initiated email or
    password change 400'd with "Current password is required for this account update."
    """
    manager, _ = _make_manager()
    request = MagicMock()
    user = MagicMock()
    user.email = "old@example.com"
    updated_user = MagicMock()
    updated_user.id = "user-id"
    updated_user.email = "new@example.com"
    update = UserUpdate(email="new@example.com")  # an admin has no current_password to send

    manager.request_verify = AsyncMock()

    async def update_override_side_effect(*_args: object) -> UserUpdate:
        return update

    async def base_update_side_effect(*_args: object, **_kwargs: object) -> MagicMock:
        return updated_user

    with (
        patch(
            "app.api.auth.services.user_manager.update_user_override",
            side_effect=update_override_side_effect,
        ),
        patch.object(BaseUserManager, "update", side_effect=base_update_side_effect),
        patch("app.api.auth.services.user_manager.revoke_user_refresh_tokens", new_callable=AsyncMock),
        patch("app.api.auth.services.user_manager.send_email_changed_notification", new_callable=AsyncMock),
    ):
        result = await manager.update(update, user, safe=False, request=request)

    assert result is updated_user


async def test_on_after_login_does_not_store_or_log_ip_address(caplog: pytest.LogCaptureFixture) -> None:
    """Successful login should update timestamp without retaining the request IP."""
    manager, mock_session = _make_manager()
    mock_session.commit = AsyncMock()

    class LoginUser:
        email = "user@example.com"
        last_login_at = None

    user = LoginUser()
    request = MagicMock()
    request.client.host = "203.0.113.10"

    await manager.on_after_login(user, request, None)

    assert user.last_login_at is not None
    assert not hasattr(user, "last_login_ip")
    mock_session.commit.assert_awaited_once()
    assert "203.0.113.10" not in caplog.text


def test_reset_and_verification_token_audiences_are_explicit() -> None:
    """Account lifecycle JWTs should have distinct, named audiences."""
    assert UserManager.reset_password_token_audience == RESET_PASSWORD_TOKEN_AUDIENCE
    assert UserManager.verification_token_audience == VERIFICATION_TOKEN_AUDIENCE
    assert RESET_PASSWORD_TOKEN_AUDIENCE != VERIFICATION_TOKEN_AUDIENCE


def test_reset_and_verification_token_audiences_cannot_be_cross_used() -> None:
    """A reset token must not decode in a verification-token context, or vice versa."""
    secret = SECRET.get_secret_value()
    reset_token = generate_jwt(
        {"sub": "user-id", "aud": RESET_PASSWORD_TOKEN_AUDIENCE},
        secret,
        lifetime_seconds=60,
    )
    verify_token = generate_jwt(
        {"sub": "user-id", "email": "user@example.com", "aud": VERIFICATION_TOKEN_AUDIENCE},
        secret,
        lifetime_seconds=60,
    )

    with pytest.raises(InvalidAudienceError):
        decode_jwt(reset_token, secret, [VERIFICATION_TOKEN_AUDIENCE])
    with pytest.raises(InvalidAudienceError):
        decode_jwt(verify_token, secret, [RESET_PASSWORD_TOKEN_AUDIENCE])


async def test_on_after_forgot_password_uses_background_tasks_from_request_state() -> None:
    """Reset-link email sending should be queued when the route provides background tasks."""
    manager, _ = _make_manager()
    user = MagicMock()
    user.email = "user@example.com"
    user.username = "user"
    request = MagicMock()
    request.state.background_tasks = MagicMock()

    with patch("app.api.auth.services.user_manager.send_reset_password_email", new_callable=AsyncMock) as mock_send:
        await manager.on_after_forgot_password(user, "reset-token", request)

    mock_send.assert_awaited_once_with("user@example.com", "user", "reset-token", request.state.background_tasks)


async def test_on_after_reset_password_revokes_refresh_tokens_and_sends_confirmation() -> None:
    """Successful password resets should invalidate active sessions and send a confirmation email."""
    manager, mock_session = _make_manager()
    mock_session.commit = AsyncMock()
    user = MagicMock()
    user.id = "user-id"
    user.email = "user@example.com"
    user.username = "user"
    # An OAuth-only account resetting its password gains a usable one.
    user.has_usable_password = False
    request = MagicMock()
    redis = object()
    request.app.state.services = AppServices(redis=redis)

    with (
        patch(
            "app.api.auth.services.account_security.refresh_token_service.revoke_all_user_tokens",
            new_callable=AsyncMock,
        ) as mock_revoke,
        patch(
            "app.api.auth.services.user_manager.send_password_reset_confirmation_email",
            new_callable=AsyncMock,
        ) as mock_send,
    ):
        await manager.on_after_reset_password(user, request)

    mock_revoke.assert_awaited_once_with(redis, "user-id")
    mock_send.assert_awaited_once_with("user@example.com", "user")
    assert user.has_usable_password is True
    mock_session.commit.assert_awaited_once()


async def test_on_after_update_logs_deactivation_with_enum_action() -> None:
    """Deactivation must revoke every live session and audit with the typed AuditAction enum."""
    manager, _ = _make_manager()
    user = MagicMock()
    user.id = "user-id"
    request = MagicMock()
    redis = object()
    request.app.state.services = AppServices(redis=redis)

    with (
        patch(
            "app.api.auth.services.account_security.refresh_token_service.revoke_all_user_tokens",
            new_callable=AsyncMock,
        ) as revoke,
        patch("app.api.auth.services.user_manager.audit_event") as log_audit,
    ):
        await manager.on_after_update(user, {"is_active": False}, request)

    # A deactivated user must not keep usable refresh sessions.
    revoke.assert_awaited_once_with(redis, "user-id")
    log_audit.assert_called_once_with("user-id", AuditAction.DEACTIVATE, User, "user-id")


async def test_on_after_update_keeps_sessions_when_not_deactivating() -> None:
    """A non-deactivating update must not revoke sessions or emit a deactivation audit."""
    manager, _ = _make_manager()
    user = MagicMock()
    user.id = "user-id"
    request = MagicMock()
    request.app.state.services = AppServices(redis=object())

    with (
        patch(
            "app.api.auth.services.account_security.refresh_token_service.revoke_all_user_tokens",
            new_callable=AsyncMock,
        ) as revoke,
        patch("app.api.auth.services.user_manager.audit_event") as log_audit,
    ):
        await manager.on_after_update(user, {"is_active": True}, request)

    revoke.assert_not_awaited()
    log_audit.assert_not_called()


async def test_delete_revokes_refresh_tokens_before_removing_the_row() -> None:
    """Sessions must be revoked before the row is deleted, so a Redis outage aborts cleanly."""
    manager, _ = _make_manager()
    user = MagicMock()
    user.id = "user-id"
    request = MagicMock()
    redis = object()
    request.app.state.services = AppServices(redis=redis)

    call_order: list[str] = []

    async def _revoke(*_args: object) -> None:
        call_order.append("revoke")

    async def _delete_row(*_args: object) -> None:
        call_order.append("delete_row")

    manager.user_db.delete = AsyncMock(side_effect=_delete_row)

    with (
        patch(
            "app.api.auth.services.account_security.refresh_token_service.revoke_all_user_tokens",
            new_callable=AsyncMock,
            side_effect=_revoke,
        ) as mock_revoke,
        patch("app.api.auth.services.user_manager.audit_event") as log_audit,
    ):
        await manager.delete(user, request=request)

    assert call_order == ["revoke", "delete_row"]
    mock_revoke.assert_awaited_once_with(redis, "user-id")
    log_audit.assert_not_called()


async def test_delete_aborts_without_removing_the_row_when_revocation_fails() -> None:
    """A Redis failure must leave the user intact rather than deleting it with live sessions."""
    manager, _ = _make_manager()
    user = MagicMock()
    user.id = "user-id"
    request = MagicMock()
    request.app.state.services = AppServices(redis=object())
    manager.user_db.delete = AsyncMock()

    with (
        patch(
            "app.api.auth.services.account_security.refresh_token_service.revoke_all_user_tokens",
            new_callable=AsyncMock,
            side_effect=ConnectionError("redis down"),
        ),
        pytest.raises(ConnectionError),
    ):
        await manager.delete(user, request=request)

    manager.user_db.delete.assert_not_awaited()


async def test_on_after_register_welcomes_oauth_signup_and_marks_password_unusable() -> None:
    """A user created via OAuth is welcomed and recorded as having no usable password."""
    manager, mock_session = _make_manager()
    mock_session.commit = AsyncMock()
    oauth_account = MagicMock()
    oauth_account.oauth_name = "google"
    user = MagicMock()
    user.email = "new@example.com"
    user.username = "newuser"
    user.oauth_accounts = [oauth_account]
    user.has_usable_password = True  # column default before the hook runs

    with patch("app.api.auth.services.user_manager.send_oauth_welcome_notification", new_callable=AsyncMock) as welcome:
        await manager.on_after_register(user, request=None)

    welcome.assert_awaited_once()
    assert welcome.await_args.kwargs["oauth_provider"] == "google"
    # OAuth-created accounts get a random password they can never use.
    assert user.has_usable_password is False
    mock_session.commit.assert_awaited_once()


async def test_on_after_register_skips_password_signup() -> None:
    """A password signup keeps its usable password and is not welcomed here."""
    manager, mock_session = _make_manager()
    mock_session.commit = AsyncMock()
    user = MagicMock()
    user.oauth_accounts = []
    user.has_usable_password = True

    with patch("app.api.auth.services.user_manager.send_oauth_welcome_notification", new_callable=AsyncMock) as welcome:
        await manager.on_after_register(user, request=None)

    welcome.assert_not_called()
    assert user.has_usable_password is True


@pytest.mark.parametrize("oauth_accounts", [[], [MagicMock(oauth_name="google")]])
async def test_on_after_register_records_terms_acceptance(oauth_accounts: list[MagicMock]) -> None:
    """Creating an account is the acceptance, on the password and the OAuth path alike."""
    manager, mock_session = _make_manager()
    mock_session.commit = AsyncMock()
    user = MagicMock()
    user.oauth_accounts = oauth_accounts
    user.has_usable_password = True
    user.terms_accepted_version = None
    user.terms_accepted_at = None

    with patch("app.api.auth.services.user_manager.send_oauth_welcome_notification", new_callable=AsyncMock):
        await manager.on_after_register(user, request=MagicMock())

    assert user.terms_accepted_version == CURRENT_TERMS_VERSION
    assert user.terms_accepted_at is not None
    assert user.terms_accepted_at.tzinfo is not None
    mock_session.commit.assert_awaited()


async def test_on_after_register_leaves_programmatic_accounts_unaccepted() -> None:
    """Seeded and CLI-created accounts saw no signup screen, so they accept nothing.

    Programmatic creation reaches ``create`` without a request. Stamping acceptance there would
    fabricate the evidence these columns exist to provide, so they must stay NULL.
    """
    manager, mock_session = _make_manager()
    mock_session.commit = AsyncMock()
    user = MagicMock()
    user.oauth_accounts = []
    user.has_usable_password = True
    user.terms_accepted_version = None
    user.terms_accepted_at = None

    with patch("app.api.auth.services.user_manager.send_oauth_welcome_notification", new_callable=AsyncMock):
        await manager.on_after_register(user, request=None)

    assert user.terms_accepted_version is None
    assert user.terms_accepted_at is None
