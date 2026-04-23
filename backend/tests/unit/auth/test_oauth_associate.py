"""Unit tests for the OAuth account-association callback handler.

Focuses on the security-sensitive branches of
:meth:`CustomOAuthAssociateRouterBuilder._get_callback_handler`:

* state/sub mismatch → reject (CSRF / session fixation)
* provider returns no email → reject
* OAuth account already linked to a different user → reject
* same-user re-associate → in-place token update (idempotent)
* frontend redirect path → success redirect is returned
"""
# ruff: noqa: SLF001 — the private callback/authorize handlers are the subject under test

from __future__ import annotations

from types import SimpleNamespace
from typing import TYPE_CHECKING, Any, cast
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest

if TYPE_CHECKING:
    from collections.abc import Mapping

from app.api.auth.exceptions import (
    OAuthAccountAlreadyLinkedError,
    OAuthEmailUnavailableError,
    OAuthInvalidRedirectURIError,
    OAuthInvalidStateError,
)
from app.api.auth.services.oauth.associate import CustomOAuthAssociateRouterBuilder
from app.api.auth.services.oauth_utils import CSRF_TOKEN_KEY

STATE_SECRET = "test-state-secret-at-least-32-bytes-long-for-hmac-sha256"


def _make_builder() -> tuple[CustomOAuthAssociateRouterBuilder, MagicMock, MagicMock]:
    """Return (builder, oauth_client_mock, user_schema_mock) so tests can poke the mocks with correct typing."""
    oauth_client = MagicMock()
    oauth_client.name = "google"
    user_schema = MagicMock()
    builder = CustomOAuthAssociateRouterBuilder(
        oauth_client=cast("Any", oauth_client),
        authenticator=cast("Any", MagicMock()),
        user_schema=cast("Any", user_schema),
        state_secret=STATE_SECRET,
    )
    return builder, oauth_client, user_schema


def _user(user_id: UUID | None = None) -> MagicMock:
    user = MagicMock()
    user.id = user_id or uuid4()
    return user


def _session_returning(existing: object | None) -> MagicMock:
    """Build an AsyncSession mock whose `execute().scalars().first()` yields `existing`."""
    session = MagicMock()
    scalars = MagicMock()
    scalars.first.return_value = existing
    result = MagicMock()
    result.scalars.return_value = scalars
    session.execute = AsyncMock(return_value=result)
    return session


def _user_manager_for(session: MagicMock) -> MagicMock:
    um = MagicMock()
    um.user_db = MagicMock()
    um.user_db.session = session
    um.user_db.update_oauth_account = AsyncMock()
    um.oauth_associate_callback = AsyncMock()
    return um


def _patch_verify_state(builder: CustomOAuthAssociateRouterBuilder, state_data: dict[str, str]) -> None:
    cast("Any", builder).verify_state = MagicMock(return_value=state_data)


def _access_token_state(token: Mapping[str, object]) -> Any:  # noqa: ANN401 — the tuple type is an opaque httpx-oauth alias
    """Return ``(token, state)`` cast to the opaque OAuth2Token alias the handler expects."""
    return cast("Any", (token, "state"))


class TestCallbackHandlerSecurityBranches:
    """Cover the security-sensitive branches of _get_callback_handler."""

    async def test_state_sub_mismatch_rejected(self) -> None:
        """A state token whose `sub` doesn't match the current user must be rejected (session-fixation guard)."""
        builder, _, _ = _make_builder()
        user = _user()
        _patch_verify_state(builder, {"sub": str(uuid4()), CSRF_TOKEN_KEY: "csrf"})

        with pytest.raises(OAuthInvalidStateError):
            await builder._get_callback_handler(
                cast("Any", MagicMock()),
                cast("Any", user),
                _access_token_state({"access_token": "x"}),
                cast("Any", _user_manager_for(MagicMock())),
            )

    async def test_missing_email_rejected(self) -> None:
        """Providers that return no email must not be linkable."""
        builder, oauth_client, _ = _make_builder()
        user = _user()
        oauth_client.get_id_email = AsyncMock(return_value=("account-id", None))
        _patch_verify_state(builder, {"sub": str(user.id), CSRF_TOKEN_KEY: "csrf"})

        with pytest.raises(OAuthEmailUnavailableError):
            await builder._get_callback_handler(
                cast("Any", MagicMock()),
                cast("Any", user),
                _access_token_state({"access_token": "x"}),
                cast("Any", _user_manager_for(MagicMock())),
            )

    async def test_existing_link_to_other_user_rejected(self) -> None:
        """If the OAuth account_id already belongs to another user, reject (prevents takeover)."""
        builder, oauth_client, _ = _make_builder()
        user = _user()
        oauth_client.get_id_email = AsyncMock(return_value=("account-id", "new@example.com"))
        existing_account = SimpleNamespace(user_id=uuid4())  # different user
        _patch_verify_state(builder, {"sub": str(user.id), CSRF_TOKEN_KEY: "csrf"})

        session = _session_returning(existing_account)
        with pytest.raises(OAuthAccountAlreadyLinkedError):
            await builder._get_callback_handler(
                cast("Any", MagicMock()),
                cast("Any", user),
                _access_token_state({"access_token": "x"}),
                cast("Any", _user_manager_for(session)),
            )

    async def test_same_user_reassociate_updates_token_in_place(self) -> None:
        """Re-running associate for the same user upgrades the stored token (scope upgrade flow)."""
        builder, oauth_client, user_schema = _make_builder()
        user = _user()
        oauth_client.get_id_email = AsyncMock(return_value=("account-id", "me@example.com"))
        existing_account = SimpleNamespace(user_id=user.id)
        _patch_verify_state(builder, {"sub": str(user.id), CSRF_TOKEN_KEY: "csrf"})

        session = _session_returning(existing_account)
        um = _user_manager_for(session)
        um.user_db.update_oauth_account.return_value = user
        user_schema.model_validate = MagicMock(return_value="validated-user")

        token = {"access_token": "new-access", "expires_at": 1234, "refresh_token": "new-refresh"}
        result = await builder._get_callback_handler(
            cast("Any", MagicMock()),
            cast("Any", user),
            _access_token_state(token),
            cast("Any", um),
        )

        um.user_db.update_oauth_account.assert_awaited_once()
        args = um.user_db.update_oauth_account.await_args
        assert args.args[1] is existing_account
        assert args.args[2] == {
            "access_token": "new-access",
            "expires_at": 1234,
            "refresh_token": "new-refresh",
        }
        # No INSERT-style associate when updating in place
        um.oauth_associate_callback.assert_not_called()
        assert result == "validated-user"

    async def test_new_account_invokes_associate_callback(self) -> None:
        """A never-seen OAuth account_id triggers the INSERT-style associate_callback path."""
        builder, oauth_client, user_schema = _make_builder()
        user = _user()
        oauth_client.get_id_email = AsyncMock(return_value=("account-id", "me@example.com"))
        _patch_verify_state(builder, {"sub": str(user.id), CSRF_TOKEN_KEY: "csrf"})

        session = _session_returning(None)
        um = _user_manager_for(session)
        um.oauth_associate_callback.return_value = user
        user_schema.model_validate = MagicMock(return_value="validated-user")

        token = {"access_token": "at", "expires_at": 9, "refresh_token": "rt"}
        result = await builder._get_callback_handler(
            cast("Any", MagicMock()),
            cast("Any", user),
            _access_token_state(token),
            cast("Any", um),
        )

        um.oauth_associate_callback.assert_awaited_once()
        um.user_db.update_oauth_account.assert_not_called()
        assert result == "validated-user"

    async def test_frontend_redirect_returns_redirect_response(self) -> None:
        """If the state carries a frontend_redirect_uri, the response is a redirect, not a user payload."""
        builder, oauth_client, _ = _make_builder()
        user = _user()
        oauth_client.get_id_email = AsyncMock(return_value=("account-id", "me@example.com"))
        _patch_verify_state(
            builder,
            {
                "sub": str(user.id),
                CSRF_TOKEN_KEY: "csrf",
                "frontend_redirect_uri": "https://relab.example/ok",
            },
        )
        session = _session_returning(None)
        um = _user_manager_for(session)
        um.oauth_associate_callback.return_value = user

        token = {"access_token": "at"}
        result = await builder._get_callback_handler(
            cast("Any", MagicMock()),
            cast("Any", user),
            _access_token_state(token),
            cast("Any", um),
        )

        # _create_success_redirect returns a starlette RedirectResponse
        assert result.status_code in (302, 307)
        assert "relab.example/ok" in result.headers["location"]
        assert "success=true" in result.headers["location"]


class TestAuthorizeHandler:
    """Cover the authorize-endpoint handler's redirect-URI validation."""

    async def test_authorize_without_redirect_uri(self) -> None:
        """Without a ?redirect_uri= param, the authorize handler returns the provider URL and sets a CSRF cookie."""
        builder, oauth_client, _ = _make_builder()
        builder.redirect_url = "https://api.example/cb"
        oauth_client.get_authorization_url = AsyncMock(return_value="https://provider.example/auth?x=1")
        user = _user()
        request = MagicMock()
        request.query_params = {}
        response = MagicMock()

        result = await builder._get_authorize_handler(
            cast("Any", request), cast("Any", response), cast("Any", user), scopes=None
        )

        assert result.authorization_url == "https://provider.example/auth?x=1"
        # CSRF cookie was set with a random token
        response.set_cookie.assert_called_once()

    async def test_authorize_rejects_disallowed_redirect_uri(self) -> None:
        """An attacker-supplied redirect_uri outside the allowlist must be rejected."""
        builder, oauth_client, _ = _make_builder()
        builder.redirect_url = "https://api.example/cb"
        oauth_client.get_authorization_url = AsyncMock()
        # Force the allowlist check to reject.
        cast("Any", builder)._is_allowed_frontend_redirect = MagicMock(return_value=False)
        user = _user()
        request = MagicMock()
        request.query_params = {"redirect_uri": "https://evil.example/"}
        response = MagicMock()

        with pytest.raises(OAuthInvalidRedirectURIError):
            await builder._get_authorize_handler(
                cast("Any", request), cast("Any", response), cast("Any", user), scopes=None
            )
        oauth_client.get_authorization_url.assert_not_called()

    async def test_authorize_embeds_allowed_frontend_redirect_in_state(self) -> None:
        """An allowed redirect_uri gets embedded into the state token for later use in the callback."""
        builder, oauth_client, _ = _make_builder()
        builder.redirect_url = "https://api.example/cb"
        oauth_client.get_authorization_url = AsyncMock(return_value="https://provider.example/auth")
        cast("Any", builder)._is_allowed_frontend_redirect = MagicMock(return_value=True)
        user = _user()
        request = MagicMock()
        request.query_params = {"redirect_uri": "https://relab.example/ok"}
        response = MagicMock()

        await builder._get_authorize_handler(
            cast("Any", request), cast("Any", response), cast("Any", user), scopes=["openid"]
        )

        # The state token is opaque here, but we can assert get_authorization_url was called
        # with it — non-empty — and scopes propagated.
        call = oauth_client.get_authorization_url.await_args
        assert call is not None
        assert call.args[0] == "https://api.example/cb"
        assert isinstance(call.args[1], str)
        assert len(call.args[1]) > 20
        assert call.args[2] == ["openid"]
