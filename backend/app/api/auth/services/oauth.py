"""Consolidation of OAuth services and builders."""

import logging
import secrets
from dataclasses import dataclass
from typing import TYPE_CHECKING, Annotated, Any, Literal
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from fastapi.responses import Response as FastAPIResponse
from fastapi_users import models, schemas
from fastapi_users.authentication import AuthenticationBackend, Authenticator, Strategy
from fastapi_users.exceptions import UserAlreadyExists
from fastapi_users.jwt import SecretType, decode_jwt, generate_jwt
from fastapi_users.router.common import ErrorCode
from httpx_oauth.clients.github import GitHubOAuth2
from httpx_oauth.clients.google import BASE_SCOPES as GOOGLE_BASE_SCOPES
from httpx_oauth.clients.google import GoogleOAuth2
from httpx_oauth.integrations.fastapi import OAuth2AuthorizeCallback
from pydantic import BaseModel
from sqlmodel import select

from app.api.auth.config import settings
from app.api.auth.models import OAuthAccount, User
from app.api.auth.services.user_manager import (
    UserManager,
    fastapi_user_manager,
)
from app.core.config import settings as core_settings

if TYPE_CHECKING:
    from httpx_oauth.oauth2 import BaseOAuth2, OAuth2Token

logger = logging.getLogger(__name__)

# Constants
STATE_TOKEN_AUDIENCE = "fastapi-users:oauth-state"  # noqa: S105
CSRF_TOKEN_KEY = "csrftoken"  # noqa: S105
CSRF_TOKEN_COOKIE_NAME = "fastapiusersoauthcsrf"  # noqa: S105
SET_COOKIE_HEADER = b"set-cookie"
ACCESS_TOKEN_KEY = "access_token"  # noqa: S105

### OAuth Clients ###

# Google
google_oauth_client = GoogleOAuth2(
    settings.google_oauth_client_id.get_secret_value(),
    settings.google_oauth_client_secret.get_secret_value(),
    scopes=GOOGLE_BASE_SCOPES,
)

# YouTube (only used for RPi-cam plugin)
GOOGLE_YOUTUBE_SCOPES = GOOGLE_BASE_SCOPES + settings.youtube_api_scopes
google_youtube_oauth_client = GoogleOAuth2(
    settings.google_oauth_client_id.get_secret_value(),
    settings.google_oauth_client_secret.get_secret_value(),
    scopes=GOOGLE_YOUTUBE_SCOPES,
)

# GitHub
github_oauth_client = GitHubOAuth2(
    settings.github_oauth_client_id.get_secret_value(),
    settings.github_oauth_client_secret.get_secret_value(),
)


### Helper Functions & DTOs ###


class OAuth2AuthorizeResponse(BaseModel):
    """Response model for OAuth2 authorization endpoint."""

    authorization_url: str


def generate_state_token(data: dict[str, str], secret: SecretType, lifetime_seconds: int = 3600) -> str:
    """Generate a JWT state token for OAuth flows."""
    data["aud"] = STATE_TOKEN_AUDIENCE
    return generate_jwt(data, secret, lifetime_seconds)


def generate_csrf_token() -> str:
    """Generate a CSRF token for OAuth flows."""
    return secrets.token_urlsafe(32)


@dataclass
class OAuthCookieSettings:
    """Configuration for OAuth CSRF cookies."""

    name: str = CSRF_TOKEN_COOKIE_NAME
    path: str = "/"
    domain: str | None = None
    secure: bool = True
    httponly: bool = True
    samesite: Literal["lax", "strict", "none"] = "lax"


class BaseOAuthRouterBuilder:
    """Base class for building OAuth routers with dynamic redirects."""

    def __init__(
        self,
        oauth_client: BaseOAuth2,
        state_secret: SecretType,
        redirect_url: str | None = None,
        cookie_settings: OAuthCookieSettings | None = None,
    ) -> None:
        """Initialize base builder properties."""
        self.oauth_client = oauth_client
        self.state_secret = state_secret
        self.redirect_url = redirect_url
        self.cookie_settings = cookie_settings or OAuthCookieSettings()

    def set_csrf_cookie(self, response: Response, csrf_token: str) -> None:
        """Set the CSRF cookie on the response."""
        response.set_cookie(
            self.cookie_settings.name,
            csrf_token,
            max_age=3600,
            path=self.cookie_settings.path,
            domain=self.cookie_settings.domain,
            secure=self.cookie_settings.secure,
            httponly=self.cookie_settings.httponly,
            samesite=self.cookie_settings.samesite,
        )

    def verify_state(self, request: Request, state: str) -> dict[str, Any]:
        """Decode the state JWT and verify CSRF protection."""
        try:
            state_data = decode_jwt(state, self.state_secret, [STATE_TOKEN_AUDIENCE])
        except jwt.DecodeError as err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ErrorCode.ACCESS_TOKEN_DECODE_ERROR,
            ) from err
        except jwt.ExpiredSignatureError as err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ErrorCode.ACCESS_TOKEN_ALREADY_EXPIRED,
            ) from err

        cookie_csrf_token = request.cookies.get(self.cookie_settings.name)
        state_csrf_token = state_data.get(CSRF_TOKEN_KEY)

        if (
            not cookie_csrf_token
            or not state_csrf_token
            or not secrets.compare_digest(cookie_csrf_token, state_csrf_token)
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ErrorCode.OAUTH_INVALID_STATE,
            )

        return state_data

    def _create_success_redirect(
        self,
        frontend_redirect: str,
        response: Response,
    ) -> Response:
        """Create a redirect to the frontend with cookies and success status."""
        parts = list(urlparse(frontend_redirect))
        query = dict(parse_qsl(parts[4]))

        # Do not propagate access tokens through URL query params.
        query.pop(ACCESS_TOKEN_KEY, None)
        query["success"] = "true"

        parts[4] = urlencode(query)
        redirect_response = RedirectResponse(urlunparse(parts))

        for raw_header in response.raw_headers:
            if raw_header[0].lower() == SET_COOKIE_HEADER:
                redirect_response.headers.append("set-cookie", raw_header[1].decode("latin-1"))
        return redirect_response

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

    @staticmethod
    def _normalize_origin(url: str) -> str:
        """Normalize a URL into scheme://host[:port]."""
        parsed = urlparse(url)
        return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}".rstrip("/")

    @staticmethod
    def _normalize_redirect_target(url: str) -> str:
        """Normalize a redirect target to scheme://netloc/path with no query/fragment."""
        parsed = urlparse(url)
        return urlunparse((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path, "", "", "")).rstrip("/")

    def _is_allowed_frontend_redirect(self, redirect_uri: str) -> bool:
        """Validate whether a frontend redirect URI is explicitly allowed."""
        parsed = urlparse(redirect_uri)
        if not parsed.scheme:
            return False

        # Prevent credentials in URL and prevent fragment smuggling.
        if parsed.username or parsed.password or parsed.fragment:
            return False

        if parsed.scheme in {"http", "https"}:
            if not parsed.netloc:
                return False

            allowed_origins = {
                self._normalize_origin(str(core_settings.frontend_web_url)),
                self._normalize_origin(str(core_settings.frontend_app_url)),
                *{self._normalize_origin(origin) for origin in settings.oauth_allowed_redirect_origins},
            }

            redirect_origin = self._normalize_origin(redirect_uri)
            if redirect_origin not in allowed_origins:
                return False

            if settings.oauth_allowed_redirect_paths:
                return parsed.path in settings.oauth_allowed_redirect_paths

            return True

        normalized_redirect = self._normalize_redirect_target(redirect_uri)
        allowed_native_redirects = {
            self._normalize_redirect_target(uri) for uri in settings.oauth_allowed_native_redirect_uris
        }
        return normalized_redirect in allowed_native_redirects


class CustomOAuthRouterBuilder(BaseOAuthRouterBuilder):
    """Builder for the main OAuth authentication router."""

    def __init__(
        self,
        oauth_client: BaseOAuth2,
        backend: AuthenticationBackend[User, models.ID],
        state_secret: SecretType,
        redirect_url: str | None = None,
        cookie_settings: OAuthCookieSettings | None = None,
        *,
        associate_by_email: bool = False,
        is_verified_by_default: bool = False,
    ) -> None:
        """Initialize the router builder."""
        super().__init__(oauth_client, state_secret, redirect_url, cookie_settings)
        self.backend = backend
        self.associate_by_email = associate_by_email
        self.is_verified_by_default = is_verified_by_default
        self.callback_route_name = f"oauth:{oauth_client.name}.{backend.name}.callback"

    def build(self) -> APIRouter:
        """Construct the APIRouter."""
        router = APIRouter()

        callback_route_name = self.callback_route_name
        if self.redirect_url is not None:
            oauth2_authorize_callback = OAuth2AuthorizeCallback(self.oauth_client, redirect_url=self.redirect_url)
        else:
            oauth2_authorize_callback = OAuth2AuthorizeCallback(self.oauth_client, route_name=callback_route_name)

        @router.get(
            "/authorize",
            name=f"oauth:{self.oauth_client.name}.{self.backend.name}.authorize",
            response_model=OAuth2AuthorizeResponse,
        )
        async def authorize(
            request: Request,
            response: Response,
            scopes: Annotated[list[str] | None, Query()] = None,
        ) -> OAuth2AuthorizeResponse:
            return await self._get_authorize_handler(request, response, scopes)

        @router.get(
            "/callback",
            name=callback_route_name,
            description="The response varies based on the authentication backend used.",
        )
        async def callback(
            request: Request,
            access_token_state: Annotated[tuple[OAuth2Token, str], Depends(oauth2_authorize_callback)],
            user_manager: Annotated[UserManager, Depends(fastapi_user_manager.get_user_manager)],
            strategy: Annotated[Strategy[User, models.ID], Depends(self.backend.get_strategy)],
        ) -> Response:
            return await self._get_callback_handler(request, access_token_state, user_manager, strategy)

        return router

    async def _get_authorize_handler(
        self,
        request: Request,
        response: Response,
        scopes: list[str] | None,
    ) -> OAuth2AuthorizeResponse:
        authorize_redirect_url = self.redirect_url
        if authorize_redirect_url is None:
            authorize_redirect_url = str(request.url_for(self.callback_route_name))

        csrf_token = generate_csrf_token()
        state_data: dict[str, str] = {CSRF_TOKEN_KEY: csrf_token}

        redirect_uri = request.query_params.get("redirect_uri")
        if redirect_uri:
            if not self._is_allowed_frontend_redirect(redirect_uri):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid redirect_uri")
            state_data["frontend_redirect_uri"] = redirect_uri

        state = generate_state_token(state_data, self.state_secret)
        authorization_url = await self.oauth_client.get_authorization_url(
            authorize_redirect_url,
            state,
            scopes,
        )

        self.set_csrf_cookie(response, csrf_token)
        return OAuth2AuthorizeResponse(authorization_url=authorization_url)

    async def _get_callback_handler(
        self,
        request: Request,
        access_token_state: tuple[OAuth2Token, str],
        user_manager: UserManager,
        strategy: Strategy[User, models.ID],
    ) -> Response:
        token, state = access_token_state
        state_data = self.verify_state(request, state)
        frontend_redirect = state_data.get("frontend_redirect_uri")

        account_id, account_email = await self.oauth_client.get_id_email(token["access_token"])
        if account_email is None:
            if frontend_redirect:
                return self._create_error_redirect(frontend_redirect, ErrorCode.OAUTH_NOT_AVAILABLE_EMAIL.value)
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=ErrorCode.OAUTH_NOT_AVAILABLE_EMAIL)

        try:
            user = await user_manager.oauth_callback(
                self.oauth_client.name,
                token[ACCESS_TOKEN_KEY],
                account_id,
                account_email,
                token.get("expires_at"),
                token.get("refresh_token"),
                request,
                associate_by_email=self.associate_by_email,
                is_verified_by_default=self.is_verified_by_default,
            )
        except UserAlreadyExists:
            if frontend_redirect:
                return self._create_error_redirect(frontend_redirect, ErrorCode.OAUTH_USER_ALREADY_EXISTS.value)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ErrorCode.OAUTH_USER_ALREADY_EXISTS,
            )

        if not user.is_active:
            if frontend_redirect:
                return self._create_error_redirect(frontend_redirect, ErrorCode.LOGIN_BAD_CREDENTIALS.value)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ErrorCode.LOGIN_BAD_CREDENTIALS,
            )

        response = await self.backend.login(strategy, user)
        await user_manager.on_after_login(user, request, response)

        if frontend_redirect:
            return self._create_success_redirect(frontend_redirect, response)

        return response


class CustomOAuthAssociateRouterBuilder(BaseOAuthRouterBuilder):
    """Builder for the OAuth association router."""

    def __init__(
        self,
        oauth_client: BaseOAuth2,
        authenticator: Authenticator[User, models.ID],
        user_schema: type[schemas.U],
        state_secret: SecretType,
        redirect_url: str | None = None,
        cookie_settings: OAuthCookieSettings | None = None,
        *,
        requires_verification: bool = False,
    ) -> None:
        """Initialize association router builder."""
        super().__init__(oauth_client, state_secret, redirect_url, cookie_settings)
        self.authenticator = authenticator
        self.user_schema = user_schema
        self.requires_verification = requires_verification
        self.callback_route_name = f"oauth-associate:{oauth_client.name}.callback"

    def build(self) -> APIRouter:
        """Construct the APIRouter."""
        router = APIRouter()
        get_current_active_user = self.authenticator.current_user(active=True, verified=self.requires_verification)

        callback_route_name = self.callback_route_name
        if self.redirect_url is not None:
            oauth2_authorize_callback = OAuth2AuthorizeCallback(self.oauth_client, redirect_url=self.redirect_url)
        else:
            oauth2_authorize_callback = OAuth2AuthorizeCallback(self.oauth_client, route_name=callback_route_name)

        @router.get(
            "/authorize",
            name=f"oauth-associate:{self.oauth_client.name}.authorize",
            response_model=OAuth2AuthorizeResponse,
        )
        async def authorize(
            request: Request,
            response: Response,
            user: Annotated[User, Depends(get_current_active_user)],
            scopes: Annotated[list[str] | None, Query()] = None,
        ) -> OAuth2AuthorizeResponse:
            return await self._get_authorize_handler(request, response, user, scopes)

        @router.get(
            "/callback",
            response_model=self.user_schema,
            name=callback_route_name,
            description="The response varies based on the authentication backend used.",
        )
        async def callback(
            request: Request,
            user: Annotated[User, Depends(get_current_active_user)],
            access_token_state: Annotated[tuple[OAuth2Token, str], Depends(oauth2_authorize_callback)],
            user_manager: Annotated[UserManager, Depends(fastapi_user_manager.get_user_manager)],
        ) -> Any:  # noqa: ANN401
            return await self._get_callback_handler(request, user, access_token_state, user_manager)

        return router

    async def _get_authorize_handler(
        self,
        request: Request,
        response: Response,
        user: User,
        scopes: list[str] | None,
    ) -> OAuth2AuthorizeResponse:
        authorize_redirect_url = self.redirect_url
        if authorize_redirect_url is None:
            authorize_redirect_url = str(request.url_for(self.callback_route_name))

        csrf_token = generate_csrf_token()
        state_data: dict[str, str] = {"sub": str(user.id), CSRF_TOKEN_KEY: csrf_token}

        redirect_uri = request.query_params.get("redirect_uri")
        if redirect_uri:
            if not self._is_allowed_frontend_redirect(redirect_uri):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid redirect_uri")
            state_data["frontend_redirect_uri"] = redirect_uri

        state = generate_state_token(state_data, self.state_secret)
        authorization_url = await self.oauth_client.get_authorization_url(
            authorize_redirect_url,
            state,
            scopes,
        )

        self.set_csrf_cookie(response, csrf_token)
        return OAuth2AuthorizeResponse(authorization_url=authorization_url)

    async def _get_callback_handler(
        self,
        request: Request,
        user: User,
        access_token_state: tuple[OAuth2Token, str],
        user_manager: UserManager,
    ) -> Any:  # noqa: ANN401
        token, state = access_token_state
        state_data = self.verify_state(request, state)

        if state_data.get("sub") != str(user.id):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=ErrorCode.OAUTH_INVALID_STATE)

        account_id, account_email = await self.oauth_client.get_id_email(token["access_token"])
        if account_email is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=ErrorCode.OAUTH_NOT_AVAILABLE_EMAIL)

        # Pre-check: Is this account already linked somewhere else?
        session = user_manager.user_db.session
        existing_account = (
            await session.exec(
                select(OAuthAccount).where(
                    OAuthAccount.oauth_name == self.oauth_client.name,
                    OAuthAccount.account_id == account_id,
                )
            )
        ).first()

        if existing_account and existing_account.user_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This account is already linked to another user.",
            )

        user = await user_manager.oauth_associate_callback(
            user,
            self.oauth_client.name,
            token["access_token"],
            account_id,
            account_email,
            token.get("expires_at"),
            token.get("refresh_token"),
            request,
        )

        frontend_redirect = state_data.get("frontend_redirect_uri")
        if frontend_redirect:
            return self._create_success_redirect(frontend_redirect, FastAPIResponse())

        return self.user_schema.model_validate(user)
