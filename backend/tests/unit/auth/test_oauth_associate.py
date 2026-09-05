"""Unit tests for the OAuth account-association flow."""

from dataclasses import dataclass, field
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any, cast
from unittest.mock import AsyncMock, MagicMock
from urllib.parse import parse_qs, urlparse
from uuid import UUID, uuid4

import pytest

from app.api.auth.exceptions import (
    OAuthAccountAlreadyLinkedError,
    OAuthEmailUnavailableError,
    OAuthInvalidRedirectURIError,
    OAuthInvalidStateError,
)
from app.api.auth.services.oauth.associate import (
    _require_account_email,
    _require_account_not_linked_elsewhere,
    _require_state_belongs_to_user,
    handle_oauth_associate_callback,
)
from app.api.auth.services.oauth.base import OAuthFlowConfig, build_authorize_response
from app.api.auth.services.oauth.utils import (
    CSRF_TOKEN_KEY,
    OAUTH_FLOW_KEY,
    OAUTH_PROVIDER_KEY,
    OAuthCookieSettings,
    generate_csrf_token,
    generate_state_token,
)
from tests.factories.models import UserFactory

if TYPE_CHECKING:
    from collections.abc import Mapping

    from app.api.auth.models import User

STATE_SECRET = "test-state-secret-at-least-32-bytes-long-for-hmac-sha256"


def test_accepts_matching_sub() -> None:
    """Accepts matching sub."""
    user_id = uuid4()
    _require_state_belongs_to_user({"sub": str(user_id)}, user_id)


def test_rejects_mismatching_sub() -> None:
    """Rejects mismatching sub."""
    with pytest.raises(OAuthInvalidStateError):
        _require_state_belongs_to_user({"sub": str(uuid4())}, uuid4())


def test_rejects_missing_sub() -> None:
    """Rejects missing sub."""
    with pytest.raises(OAuthInvalidStateError):
        _require_state_belongs_to_user({}, uuid4())


def test_returns_email_when_present() -> None:
    """Returns email when present."""
    assert _require_account_email("me@example.com") == "me@example.com"


def test_raises_when_none() -> None:
    """Raises when none."""
    with pytest.raises(OAuthEmailUnavailableError):
        _require_account_email(None)


def test_accepts_none() -> None:
    """Accepts none."""
    _require_account_not_linked_elsewhere(None, uuid4())


def test_accepts_same_owner() -> None:
    """Accepts same owner."""
    user_id = uuid4()
    _require_account_not_linked_elsewhere(SimpleNamespace(user_id=user_id), user_id)


def test_rejects_foreign_owner() -> None:
    """Rejects foreign owner."""
    with pytest.raises(OAuthAccountAlreadyLinkedError):
        _require_account_not_linked_elsewhere(SimpleNamespace(user_id=uuid4()), uuid4())


@dataclass
class _FakeUserDB:
    session: AsyncMock
    update_oauth_account: AsyncMock = field(default_factory=AsyncMock)


@dataclass
class _FakeUserManager:
    user_db: _FakeUserDB
    oauth_associate_callback: AsyncMock = field(default_factory=AsyncMock)


def _fake_user_manager(existing_account: object | None) -> _FakeUserManager:
    scalars = MagicMock()
    scalars.first.return_value = existing_account
    result = MagicMock()
    result.scalars.return_value = scalars
    session = AsyncMock()
    session.execute = AsyncMock(return_value=result)
    return _FakeUserManager(user_db=_FakeUserDB(session=session))


def _make_config() -> tuple[OAuthFlowConfig, MagicMock, MagicMock]:
    oauth_client = MagicMock()
    oauth_client.name = "google"
    user_schema = MagicMock()
    config = OAuthFlowConfig(
        oauth_client=oauth_client,
        state_secret=STATE_SECRET,
        oauth_flow="google:associate",
        cookie_settings=OAuthCookieSettings(),
    )
    return config, oauth_client, user_schema


def _user(user_id: UUID | None = None) -> User:
    return UserFactory.build(id=user_id or uuid4())


def _access_token_state(
    config: OAuthFlowConfig,
    token: Mapping[str, object],
    user_id: UUID,
    extra_state: dict[str, str] | None = None,
) -> tuple[MagicMock, tuple[Any, str]]:
    csrf_token = generate_csrf_token()
    state = generate_state_token(
        {
            "sub": str(user_id),
            CSRF_TOKEN_KEY: csrf_token,
            OAUTH_PROVIDER_KEY: config.oauth_client.name,
            OAUTH_FLOW_KEY: config.oauth_flow,
            **(extra_state or {}),
        },
        STATE_SECRET,
    )
    request = MagicMock()
    request.cookies = {config.cookie_settings.name: csrf_token}
    return request, (cast("Any", token), state)


async def test_same_user_reassociate_updates_token_in_place() -> None:
    """Same user reassociate updates token in place."""
    config, oauth_client, user_schema = _make_config()
    user = _user()
    oauth_client.get_id_email = AsyncMock(return_value=("account-id", "me@example.com"))
    existing_account = SimpleNamespace(user_id=user.id)
    um = _fake_user_manager(existing_account)
    um.user_db.update_oauth_account.return_value = user
    user_schema.model_validate = MagicMock(return_value="validated-user")

    token = {"access_token": "new-access", "expires_at": 1234, "refresh_token": "new-refresh"}
    request, access_token_state = _access_token_state(config, token, user.id)
    result = await handle_oauth_associate_callback(
        config,
        request,
        user,
        access_token_state,
        um,  # ty: ignore[invalid-argument-type]
        user_schema=user_schema,
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


async def test_new_account_invokes_associate_callback() -> None:
    """New account invokes associate callback."""
    config, oauth_client, user_schema = _make_config()
    user = _user()
    oauth_client.get_id_email = AsyncMock(return_value=("account-id", "me@example.com"))
    um = _fake_user_manager(None)
    um.oauth_associate_callback.return_value = user
    user_schema.model_validate = MagicMock(return_value="validated-user")

    request, access_token_state = _access_token_state(config, {"access_token": "at"}, user.id)
    result = await handle_oauth_associate_callback(
        config,
        request,
        user,
        access_token_state,
        um,  # ty: ignore[invalid-argument-type]
        user_schema=user_schema,
    )

    um.oauth_associate_callback.assert_awaited_once()
    um.user_db.update_oauth_account.assert_not_called()
    assert result == "validated-user"


async def test_frontend_redirect_returns_fragment_status() -> None:
    """Frontend redirect returns fragment status."""
    config, oauth_client, _ = _make_config()
    user = _user()
    oauth_client.get_id_email = AsyncMock(return_value=("account-id", "me@example.com"))
    um = _fake_user_manager(None)
    um.oauth_associate_callback.return_value = user
    request, access_token_state = _access_token_state(
        config,
        {"access_token": "at"},
        user.id,
        {"frontend_redirect_uri": "https://relab.example/ok"},
    )

    result = await handle_oauth_associate_callback(
        config,
        request,
        user,
        access_token_state,
        um,  # ty: ignore[invalid-argument-type]
        user_schema=MagicMock(),
    )

    assert result.status_code in (302, 307)
    parsed = urlparse(result.headers["location"])
    assert "relab.example/ok" in result.headers["location"]
    assert parse_qs(parsed.fragment)["status"] == ["success"]


async def test_authorize_without_redirect_uri() -> None:
    """Authorize without redirect uri."""
    config, oauth_client, _ = _make_config()
    config = OAuthFlowConfig(
        oauth_client=config.oauth_client,
        state_secret=config.state_secret,
        oauth_flow=config.oauth_flow,
        redirect_url="https://api.example/cb",
        cookie_settings=config.cookie_settings,
    )
    oauth_client.get_authorization_url = AsyncMock(return_value="https://provider.example/auth?x=1")
    request = MagicMock()
    request.query_params = {}
    response = MagicMock()

    result = await build_authorize_response(config, request, response, callback_route_name="unused")

    assert result.authorization_url == "https://provider.example/auth?x=1"
    response.set_cookie.assert_called_once()


async def test_authorize_rejects_disallowed_redirect_uri() -> None:
    """Authorize rejects disallowed redirect uri."""
    config, oauth_client, _ = _make_config()
    oauth_client.get_authorization_url = AsyncMock()
    request = MagicMock()
    request.query_params = {"redirect_uri": "https://evil.example/"}
    response = MagicMock()

    with pytest.raises(OAuthInvalidRedirectURIError):
        await build_authorize_response(config, request, response, callback_route_name="unused")
    oauth_client.get_authorization_url.assert_not_called()
