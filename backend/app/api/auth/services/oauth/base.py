"""Shared OAuth router builder behavior."""

from __future__ import annotations

import secrets
from typing import Any  # noqa: TC003 # Used at runtime for FastAPI validation
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import jwt
from fastapi import Request, Response
from fastapi.responses import RedirectResponse
from fastapi_users.jwt import SecretType, decode_jwt
from httpx_oauth.oauth2 import BaseOAuth2  # noqa: TC002 # Used at runtime for FastAPI validation

from app.api.auth.config import normalize_oauth_redirect_uri, settings
from app.api.auth.exceptions import (
    OAuthInvalidStateError,
    OAuthStateDecodeError,
    OAuthStateExpiredError,
)
from app.api.auth.services.oauth_utils import (
    ACCESS_TOKEN_KEY,
    CSRF_TOKEN_KEY,
    OAUTH_FLOW_KEY,
    OAUTH_PROVIDER_KEY,
    OAUTH_STATE_JWT_ALGORITHM,
    SET_COOKIE_HEADER,
    STATE_TOKEN_AUDIENCE,
    OAuthCookieSettings,
    set_csrf_cookie,
)


class BaseOAuthRouterBuilder:
    """Base class for building OAuth routers with dynamic redirects."""

    def __init__(
        self,
        oauth_client: BaseOAuth2,
        state_secret: SecretType,
        oauth_flow: str,
        redirect_url: str | None = None,
        cookie_settings: OAuthCookieSettings | None = None,
    ) -> None:
        """Initialize base builder properties.

        ``oauth_flow`` is RELab's ASVS transaction-binding identifier for this
        OAuth route, such as ``github:session`` or ``google-youtube:associate``.
        """
        self.oauth_client = oauth_client
        self.state_secret = state_secret
        self.oauth_flow = oauth_flow
        self.redirect_url = redirect_url
        self.cookie_settings = cookie_settings or OAuthCookieSettings()

    def build_state_data(self, csrf_token: str, extra: dict[str, str] | None = None) -> dict[str, str]:
        """Build signed OAuth state claims for this builder's transaction."""
        return {
            **(extra or {}),
            CSRF_TOKEN_KEY: csrf_token,
            OAUTH_PROVIDER_KEY: self.oauth_client.name,
            OAUTH_FLOW_KEY: self.oauth_flow,
        }

    def set_csrf_cookie(self, response: Response, csrf_token: str) -> None:
        """Set the CSRF cookie on the response."""
        set_csrf_cookie(response, self.cookie_settings, csrf_token)

    def verify_state(self, request: Request, state: str) -> dict[str, Any]:
        """Decode the state JWT and verify CSRF and transaction binding."""
        try:
            state_data = decode_jwt(
                state,
                self.state_secret,
                [STATE_TOKEN_AUDIENCE],
                algorithms=[OAUTH_STATE_JWT_ALGORITHM],
            )
        except jwt.ExpiredSignatureError as err:
            raise OAuthStateExpiredError from err
        except jwt.InvalidTokenError as err:
            raise OAuthStateDecodeError from err

        cookie_csrf_token = request.cookies.get(self.cookie_settings.name)
        state_csrf_token = state_data.get(CSRF_TOKEN_KEY)

        if (
            not cookie_csrf_token
            or not state_csrf_token
            or not secrets.compare_digest(cookie_csrf_token, state_csrf_token)
        ):
            raise OAuthInvalidStateError

        if state_data.get(OAUTH_PROVIDER_KEY) != self.oauth_client.name:
            raise OAuthInvalidStateError
        if state_data.get(OAUTH_FLOW_KEY) != self.oauth_flow:
            raise OAuthInvalidStateError

        return state_data

    def _create_success_redirect(
        self,
        frontend_redirect: str,
        response: Response,
    ) -> Response:
        """Create a redirect to the frontend with cookies and success status."""
        parts = list(urlparse(frontend_redirect))
        query = dict(parse_qsl(parts[4]))

        query.pop(ACCESS_TOKEN_KEY, None)
        query["success"] = "true"

        parts[4] = urlencode(query)
        redirect_response = RedirectResponse(urlunparse(parts))

        for raw_header in response.raw_headers:
            if raw_header[0].lower() == SET_COOKIE_HEADER:
                redirect_response.headers.append("set-cookie", raw_header[1].decode("latin-1"))
        return redirect_response

    @staticmethod
    def _create_mfa_redirect(frontend_redirect: str, *, mfa_handoff: str) -> Response:
        """Create a redirect to the frontend with an MFA handoff in the fragment."""
        parts = list(urlparse(frontend_redirect))
        query = dict(parse_qsl(parts[4]))
        query.pop(ACCESS_TOKEN_KEY, None)
        parts[4] = urlencode(query)

        fragment = dict(parse_qsl(parts[5]))
        fragment.pop(ACCESS_TOKEN_KEY, None)
        fragment["success"] = "false"
        fragment["mfa_handoff"] = mfa_handoff
        parts[5] = urlencode(fragment)
        return RedirectResponse(urlunparse(parts))

    @staticmethod
    def _create_error_redirect(frontend_redirect: str, detail: str) -> Response:
        """Create a redirect to the frontend with an error detail in the query string."""
        parts = list(urlparse(frontend_redirect))
        query = dict(parse_qsl(parts[4]))
        query.pop(ACCESS_TOKEN_KEY, None)
        query["success"] = "false"
        query["detail"] = detail
        parts[4] = urlencode(query)
        return RedirectResponse(urlunparse(parts))

    def _is_allowed_frontend_redirect(self, redirect_uri: str) -> bool:
        """Validate whether a frontend redirect URI is exactly allowed."""
        try:
            normalized_redirect = normalize_oauth_redirect_uri(redirect_uri)
        except ValueError:
            return False

        return normalized_redirect in settings.oauth_allowed_redirect_uris
