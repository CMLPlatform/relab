"""Unit tests for the OAuth account-association flow.

Split into two layers:

1. **Pure helper tests** — exercise the security checks (state/sub, email presence, account
   ownership) as plain function calls with plain values. No mocks, no Request/User/UserManager.
2. **Handler tests** — exercise the two branches of ``_get_callback_handler`` that actually
   need the composed flow (token upgrade vs INSERT) and the frontend-redirect return.
   These need a typed fake ``UserManager`` with three call-recording methods, nothing more.
"""
# ruff: noqa: SLF001 — the private callback/authorize handlers are the subject under test

from __future__ import annotations

from dataclasses import dataclass, field
from types import SimpleNamespace
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest

from app.api.auth.exceptions import (
    OAuthAccountAlreadyLinkedError,
    OAuthEmailUnavailableError,
    OAuthInvalidRedirectURIError,
    OAuthInvalidStateError,
)
from app.api.auth.services.oauth.associate import (
    CustomOAuthAssociateRouterBuilder,
    _require_account_email,
    _require_account_not_linked_elsewhere,
    _require_state_belongs_to_user,
)
from app.api.auth.services.oauth_utils import CSRF_TOKEN_KEY
from tests.factories.models import UserFactory

if TYPE_CHECKING:
    from collections.abc import Mapping

    from app.api.auth.models import User


STATE_SECRET = "test-state-secret-at-least-32-bytes-long-for-hmac-sha256"


# --- Pure helper tests (no mocks) ---


class TestRequireStateBelongsToUser:
    """State-sub ownership check (session-fixation guard)."""

    def test_accepts_matching_sub(self) -> None:
        """Matching sub is a silent pass."""
        user_id = uuid4()
        _require_state_belongs_to_user({"sub": str(user_id)}, user_id)

    def test_rejects_mismatching_sub(self) -> None:
        """A sub for a different user is a CSRF/fixation attempt — reject."""
        with pytest.raises(OAuthInvalidStateError):
            _require_state_belongs_to_user({"sub": str(uuid4())}, uuid4())

    def test_rejects_missing_sub(self) -> None:
        """Absent sub is treated the same as mismatch."""
        with pytest.raises(OAuthInvalidStateError):
            _require_state_belongs_to_user({}, uuid4())


class TestRequireAccountEmail:
    """Email presence check — providers that return no email can't be linked."""

    def test_returns_email_when_present(self) -> None:
        """Present email is returned unchanged."""
        assert _require_account_email("me@example.com") == "me@example.com"

    def test_raises_when_none(self) -> None:
        """Absent email raises the domain exception."""
        with pytest.raises(OAuthEmailUnavailableError):
            _require_account_email(None)


class TestRequireAccountNotLinkedElsewhere:
    """Account-ownership check — prevents silent takeover of an already-linked account."""

    def test_accepts_none(self) -> None:
        """No existing link means nothing to guard against."""
        _require_account_not_linked_elsewhere(None, uuid4())

    def test_accepts_same_owner(self) -> None:
        """Same-owner re-associate is allowed (scope upgrade flow)."""
        user_id = uuid4()
        _require_account_not_linked_elsewhere(SimpleNamespace(user_id=user_id), user_id)

    def test_rejects_foreign_owner(self) -> None:
        """Account already linked to another user must be rejected."""
        with pytest.raises(OAuthAccountAlreadyLinkedError):
            _require_account_not_linked_elsewhere(SimpleNamespace(user_id=uuid4()), uuid4())


# --- Handler tests (narrow, typed fakes) ---


@dataclass
class _FakeUserDB:
    """The only UserDB surface the callback handler reads."""

    session: AsyncMock
    update_oauth_account: AsyncMock = field(default_factory=AsyncMock)


@dataclass
class _FakeUserManager:
    """The only UserManager surface the callback handler reads."""

    user_db: _FakeUserDB
    oauth_associate_callback: AsyncMock = field(default_factory=AsyncMock)


def _fake_user_manager(existing_account: object | None) -> _FakeUserManager:
    """Build a fake user manager whose session yields ``existing_account`` on any query."""
    scalars = MagicMock()
    scalars.first.return_value = existing_account
    result = MagicMock()
    result.scalars.return_value = scalars
    session = AsyncMock()
    session.execute = AsyncMock(return_value=result)
    return _FakeUserManager(user_db=_FakeUserDB(session=session))


def _make_builder() -> tuple[CustomOAuthAssociateRouterBuilder, MagicMock, MagicMock]:
    """Construct a builder whose external clients are call-recording mocks."""
    oauth_client = MagicMock()
    oauth_client.name = "google"
    user_schema = MagicMock()
    builder = CustomOAuthAssociateRouterBuilder(
        oauth_client=oauth_client,
        authenticator=MagicMock(),
        user_schema=user_schema,
        state_secret=STATE_SECRET,
    )
    # Patch verify_state so tests supply state_data directly, avoiding JWT/CSRF plumbing.
    return builder, oauth_client, user_schema


def _user(user_id: UUID | None = None) -> User:
    """Build a real ``User`` via the factory — no SimpleNamespace lying about the type."""
    return UserFactory.build(id=user_id or uuid4())


def _patch_verify_state(builder: CustomOAuthAssociateRouterBuilder, state_data: dict[str, str]) -> None:
    setattr(builder, "verify_state", MagicMock(return_value=state_data))  # noqa: B010


def _access_token_state(token: Mapping[str, object]) -> tuple[Mapping[str, object], str]:
    return (token, "state")


class TestCallbackHandlerFlow:
    """Exercise the two end-to-end branches plus the frontend-redirect return."""

    async def test_same_user_reassociate_updates_token_in_place(self) -> None:
        """Re-running associate for the same user upgrades the stored token."""
        builder, oauth_client, user_schema = _make_builder()
        user = _user()
        oauth_client.get_id_email = AsyncMock(return_value=("account-id", "me@example.com"))
        existing_account = SimpleNamespace(user_id=user.id)
        _patch_verify_state(builder, {"sub": str(user.id), CSRF_TOKEN_KEY: "csrf"})

        um = _fake_user_manager(existing_account)
        um.user_db.update_oauth_account.return_value = user
        user_schema.model_validate = MagicMock(return_value="validated-user")

        token = {"access_token": "new-access", "expires_at": 1234, "refresh_token": "new-refresh"}
        result = await builder._get_callback_handler(
            MagicMock(),  # request — unused after verify_state is patched
            user,
            _access_token_state(token),  # ty: ignore[invalid-argument-type]
            um,  # ty: ignore[invalid-argument-type]
        )

        um.user_db.update_oauth_account.assert_awaited_once()
        args = um.user_db.update_oauth_account.await_args
        assert args.args[1] is existing_account
        assert args.args[2] == {
            "access_token": "new-access",
            "expires_at": 1234,
            "refresh_token": "new-refresh",
        }
        um.oauth_associate_callback.assert_not_called()
        assert result == "validated-user"

    async def test_new_account_invokes_associate_callback(self) -> None:
        """A never-seen account_id triggers the INSERT-style associate_callback path."""
        builder, oauth_client, user_schema = _make_builder()
        user = _user()
        oauth_client.get_id_email = AsyncMock(return_value=("account-id", "me@example.com"))
        _patch_verify_state(builder, {"sub": str(user.id), CSRF_TOKEN_KEY: "csrf"})

        um = _fake_user_manager(None)
        um.oauth_associate_callback.return_value = user
        user_schema.model_validate = MagicMock(return_value="validated-user")

        token = {"access_token": "at", "expires_at": 9, "refresh_token": "rt"}
        result = await builder._get_callback_handler(
            MagicMock(),
            user,
            _access_token_state(token),  # ty: ignore[invalid-argument-type]
            um,  # ty: ignore[invalid-argument-type]
        )

        um.oauth_associate_callback.assert_awaited_once()
        um.user_db.update_oauth_account.assert_not_called()
        assert result == "validated-user"

    async def test_frontend_redirect_returns_redirect_response(self) -> None:
        """A state-carried frontend_redirect_uri turns the response into a 3xx redirect."""
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
        um = _fake_user_manager(None)
        um.oauth_associate_callback.return_value = user

        token = {"access_token": "at"}
        result = await builder._get_callback_handler(
            MagicMock(),
            user,
            _access_token_state(token),  # ty: ignore[invalid-argument-type]
            um,  # ty: ignore[invalid-argument-type]
        )

        assert result.status_code in (302, 307)
        assert "relab.example/ok" in result.headers["location"]
        assert "success=true" in result.headers["location"]


class TestAuthorizeHandler:
    """Cover the authorize-endpoint handler's redirect-URI validation."""

    async def test_authorize_without_redirect_uri(self) -> None:
        """Without ?redirect_uri=, returns the provider URL and sets a CSRF cookie."""
        builder, oauth_client, _ = _make_builder()
        builder.redirect_url = "https://api.example/cb"
        oauth_client.get_authorization_url = AsyncMock(return_value="https://provider.example/auth?x=1")
        user = _user()
        request = MagicMock()
        request.query_params = {}
        response = MagicMock()

        result = await builder._get_authorize_handler(request, response, user, scopes=None)

        assert result.authorization_url == "https://provider.example/auth?x=1"
        response.set_cookie.assert_called_once()

    async def test_authorize_rejects_disallowed_redirect_uri(self) -> None:
        """An attacker-supplied redirect_uri outside the allowlist must be rejected."""
        builder, oauth_client, _ = _make_builder()
        builder.redirect_url = "https://api.example/cb"
        oauth_client.get_authorization_url = AsyncMock()
        setattr(builder, "_is_allowed_frontend_redirect", MagicMock(return_value=False))  # noqa: B010
        user = _user()
        request = MagicMock()
        request.query_params = {"redirect_uri": "https://evil.example/"}
        response = MagicMock()

        with pytest.raises(OAuthInvalidRedirectURIError):
            await builder._get_authorize_handler(request, response, user, scopes=None)
        oauth_client.get_authorization_url.assert_not_called()

    async def test_authorize_embeds_allowed_frontend_redirect_in_state(self) -> None:
        """An allowed redirect_uri gets embedded in the state token and scopes propagate."""
        builder, oauth_client, _ = _make_builder()
        builder.redirect_url = "https://api.example/cb"
        oauth_client.get_authorization_url = AsyncMock(return_value="https://provider.example/auth")
        setattr(builder, "_is_allowed_frontend_redirect", MagicMock(return_value=True))  # noqa: B010
        user = _user()
        request = MagicMock()
        request.query_params = {"redirect_uri": "https://relab.example/ok"}
        response = MagicMock()

        await builder._get_authorize_handler(request, response, user, scopes=["openid"])

        call = oauth_client.get_authorization_url.await_args
        assert call is not None
        assert call.args[0] == "https://api.example/cb"
        assert isinstance(call.args[1], str)
        assert len(call.args[1]) > 20
        assert call.args[2] == ["openid"]
