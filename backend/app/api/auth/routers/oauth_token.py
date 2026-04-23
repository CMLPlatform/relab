"""Client-side PKCE OAuth token exchange endpoints.

These endpoints receive tokens obtained by the frontend via expo-auth-session
(PKCE, no backend redirect required) and exchange them for app sessions.

Currently supported:
  POST /auth/oauth/google/bearer/token  — returns bearer + refresh tokens
  POST /auth/oauth/google/cookie/token  — sets httpOnly session cookies

GitHub keeps using the backend-mediated flow (its OAuth token exchange requires
a client secret and cannot be done client-side).
"""

import logging
from typing import TYPE_CHECKING, Annotated, cast

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi_users.authentication import Strategy
from jwt import ExpiredSignatureError, InvalidTokenError, PyJWKClient
from pydantic import UUID4, BaseModel

from app.api.auth.config import settings as auth_settings
from app.api.auth.dependencies import UserManagerDep
from app.api.auth.exceptions import (
    OAuthEmailUnavailableError,
    OAuthInactiveUserHTTPError,
    OAuthStateDecodeError,
    OAuthStateExpiredError,
)
from app.api.auth.models import User
from app.api.auth.services import refresh_token_service
from app.api.auth.services.login_hooks import log_successful_login, update_last_login_metadata
from app.api.auth.services.oauth_clients import google_oauth_client
from app.api.auth.services.user_manager import (
    UserManager,
    bearer_auth_backend,
    cookie_auth_backend,
)
from app.api.common.routers.openapi import mark_router_routes_public
from app.core.runtime import get_connection_redis

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

_GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
_GOOGLE_ISSUERS = frozenset({"https://accounts.google.com", "accounts.google.com"})
# PyJWKClient fetches and caches Google's public keys automatically.
_google_jwks_client = PyJWKClient(_GOOGLE_JWKS_URL, cache_keys=True)

router = APIRouter(prefix="/auth/oauth", tags=["oauth"])


class GoogleTokenRequest(BaseModel):
    """Body for Google PKCE token exchange."""

    id_token: str
    # The Google access token is stored in OAuthAccount for downstream API use
    # (e.g. YouTube plugin).  Falls back to id_token when not supplied.
    access_token: str | None = None


class OAuthBearerResponse(BaseModel):
    """Response for the bearer transport exchange."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"  # noqa: S105
    expires_in: int


# ── Helpers ──────────────────────────────────────────────────────────────────


def _verify_google_id_token(id_token: str) -> dict:
    """Validate a Google ID token and return its verified claims."""
    client_id = auth_settings.google_oauth_client_id.get_secret_value()
    if not client_id:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Google OAuth not configured.")

    try:
        signing_key = _google_jwks_client.get_signing_key_from_jwt(id_token)
        payload = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=client_id,
        )
    except ExpiredSignatureError as e:
        raise OAuthStateExpiredError from e
    except InvalidTokenError as e:
        raise OAuthStateDecodeError from e

    if payload.get("iss") not in _GOOGLE_ISSUERS:
        raise OAuthStateDecodeError
    if not payload.get("email_verified"):
        raise OAuthEmailUnavailableError

    return payload


async def _user_from_google_token(
    body: GoogleTokenRequest,
    user_manager: UserManager,
    request: Request,
) -> User:
    """Validate the Google ID token and resolve (or create) the corresponding user."""
    payload = _verify_google_id_token(body.id_token)
    account_id: str = payload["sub"]
    email: str = payload["email"]

    # ty false positive: User satisfies UserOAuthProtocol structurally but ty's
    # generic Protocol-inheritance checker mishandles multi-level generic Protocols.
    # Tracked upstream: https://github.com/astral-sh/ty/issues (invalid-argument-type)
    oauth_callback = cast(
        "Callable[..., Awaitable[User]]",
        user_manager.oauth_callback,
    )
    user = await oauth_callback(
        google_oauth_client.name,
        body.access_token or body.id_token,  # real access_token preferred for API storage
        account_id,
        email,
        payload.get("exp"),
        request=request,
        associate_by_email=True,
        is_verified_by_default=True,
    )
    if not user.is_active:
        raise OAuthInactiveUserHTTPError
    return user


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post(
    "/google/bearer/token",
    response_model=OAuthBearerResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Exchange Google ID token for bearer + refresh tokens (PKCE flow)",
)
async def google_bearer_token(
    body: GoogleTokenRequest,
    user_manager: UserManagerDep,
    strategy: Annotated[Strategy[User, UUID4], Depends(bearer_auth_backend.get_strategy)],
    request: Request,
) -> OAuthBearerResponse:
    """Receive a Google ID token obtained client-side via PKCE and issue app tokens."""
    user = await _user_from_google_token(body, user_manager, request)

    access_token = await strategy.write_token(user)

    redis_client = get_connection_redis(request)
    refresh_token = await refresh_token_service.create_refresh_token(redis_client, user.id)

    await update_last_login_metadata(user, request, user_manager.user_db.session)
    log_successful_login(user)

    return OAuthBearerResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=auth_settings.access_token_ttl_seconds,
    )


@router.post(
    "/google/cookie/token",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Exchange Google ID token for session cookies (PKCE flow)",
)
async def google_cookie_token(
    body: GoogleTokenRequest,
    user_manager: UserManagerDep,
    strategy: Annotated[Strategy[User, UUID4], Depends(cookie_auth_backend.get_strategy)],
    request: Request,
) -> Response:
    """Receive a Google ID token obtained client-side via PKCE and set session cookies."""
    user = await _user_from_google_token(body, user_manager, request)

    # backend.login sets the auth cookie; on_after_login adds the refresh_token cookie
    response = await cookie_auth_backend.login(strategy, user)
    await user_manager.on_after_login(user, request, response)

    return response


mark_router_routes_public(router)
