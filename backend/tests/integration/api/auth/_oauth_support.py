"""Shared helpers for OAuth router unit tests."""

from __future__ import annotations

from typing import TYPE_CHECKING, cast
from unittest.mock import AsyncMock, MagicMock

from fastapi import Response, status

from app.api.auth.services.oauth import (
    CSRF_TOKEN_KEY,
    BaseOAuthRouterBuilder,
    CustomOAuthAssociateRouterBuilder,
    CustomOAuthRouterBuilder,
    OAuthCookieSettings,
    generate_csrf_token,
    generate_state_token,
)
from app.api.auth.services.oauth_utils import OAUTH_FLOW_KEY, OAUTH_PROVIDER_KEY

from .shared import TEST_EMAIL, TEST_STATE_JWT_SECRET

if TYPE_CHECKING:
    from httpx_oauth.oauth2 import OAuth2Token


def make_base_builder() -> BaseOAuthRouterBuilder:
    """Create a base OAuth builder with a mock client."""
    mock_client = MagicMock()
    mock_client.name = "github"
    return BaseOAuthRouterBuilder(
        oauth_client=mock_client,
        state_secret=TEST_STATE_JWT_SECRET,
        oauth_flow="github:associate",
        cookie_settings=OAuthCookieSettings(),
    )


def make_auth_builder(
    *,
    provider_name: str = "github",
    backend_name: str = "cookie",
    oauth_flow: str = "github:session",
) -> CustomOAuthRouterBuilder:
    """Create an auth OAuth builder with mock client/backend."""
    mock_client = MagicMock()
    mock_client.name = provider_name
    mock_client.get_authorization_url = AsyncMock(return_value="https://github.com/login/oauth/authorize")
    mock_client.get_id_email = AsyncMock(return_value=("provider-account-id", TEST_EMAIL))

    mock_backend = MagicMock()
    mock_backend.name = backend_name
    mock_backend.login = AsyncMock(return_value=Response(status_code=status.HTTP_200_OK))

    return CustomOAuthRouterBuilder(
        oauth_client=mock_client,
        backend=mock_backend,
        state_secret=TEST_STATE_JWT_SECRET,
        oauth_flow=oauth_flow,
        cookie_settings=OAuthCookieSettings(),
    )


def make_associate_builder(
    *,
    provider_name: str = "github",
    route_name_key: str | None = None,
    oauth_flow: str = "github:associate",
) -> CustomOAuthAssociateRouterBuilder:
    """Create an associate OAuth builder with mock client/authenticator."""
    mock_client = MagicMock()
    mock_client.name = provider_name
    mock_client.get_id_email = AsyncMock(return_value=("provider-account-id", TEST_EMAIL))
    mock_authenticator = MagicMock()
    mock_schema = MagicMock()
    mock_schema.model_validate.side_effect = lambda value: {"user_id": str(value.id), "email": value.email}

    return CustomOAuthAssociateRouterBuilder(
        oauth_client=mock_client,
        authenticator=mock_authenticator,
        user_schema=mock_schema,
        state_secret=TEST_STATE_JWT_SECRET,
        oauth_flow=oauth_flow,
        cookie_settings=OAuthCookieSettings(),
        route_name_key=route_name_key,
    )


def make_oauth_state(
    csrf_token: str,
    *,
    provider_name: str,
    oauth_flow: str,
    extra_state: dict[str, str] | None = None,
) -> str:
    """Create a signed OAuth state token with transaction binding."""
    state_data = {
        **(extra_state or {}),
        CSRF_TOKEN_KEY: csrf_token,
        OAUTH_PROVIDER_KEY: provider_name,
        OAUTH_FLOW_KEY: oauth_flow,
    }
    return generate_state_token(state_data, TEST_STATE_JWT_SECRET)


def make_request_with_valid_state(
    *,
    provider_name: str = "github",
    oauth_flow: str = "github:session",
) -> tuple[MagicMock, tuple[OAuth2Token, str]]:
    """Create a mock request with a valid state token."""
    csrf_token = generate_csrf_token()
    state = make_oauth_state(
        csrf_token,
        provider_name=provider_name,
        oauth_flow=oauth_flow,
    )
    mock_request = MagicMock()
    mock_request.cookies = {OAuthCookieSettings.name: csrf_token}
    return mock_request, (cast("OAuth2Token", {"access_token": "provider-access-token"}), state)


def make_associate_request_with_valid_state(
    user_id: str,
    *,
    provider_name: str = "github",
    oauth_flow: str = "github:associate",
) -> tuple[MagicMock, tuple[OAuth2Token, str]]:
    """Create a mock associate-flow request with a valid state token."""
    csrf_token = generate_csrf_token()
    state = make_oauth_state(
        csrf_token,
        provider_name=provider_name,
        oauth_flow=oauth_flow,
        extra_state={"sub": user_id},
    )
    mock_request = MagicMock()
    mock_request.cookies = {OAuthCookieSettings.name: csrf_token}
    return mock_request, (cast("OAuth2Token", {"access_token": "provider-access-token"}), state)
