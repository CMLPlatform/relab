"""OAuth login router builder."""

from typing import TYPE_CHECKING, Annotated, cast

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi_users.exceptions import UserAlreadyExists
from fastapi_users.router.common import ErrorCode
from httpx_oauth.integrations.fastapi import OAuth2AuthorizeCallback
from httpx_oauth.oauth2 import BaseOAuth2, OAuth2Token  # noqa: TC002 # Used at runtime for FastAPI validation
from pydantic import UUID4

from app.api.auth.exceptions import (
    OAuthEmailUnavailableError,
    OAuthInactiveUserHTTPError,
    OAuthInvalidRedirectURIError,
    OAuthUserAlreadyExistsHTTPError,
)
from app.api.auth.models import User
from app.api.auth.services.oauth_utils import (
    ACCESS_TOKEN_KEY,
    CSRF_TOKEN_KEY,
    OAuth2AuthorizeResponse,
    OAuthCookieSettings,
    generate_csrf_token,
    generate_state_token,
)
from app.api.auth.services.user_manager import UserManager, fastapi_user_manager

from .base import BaseOAuthRouterBuilder

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from fastapi_users.authentication import AuthenticationBackend, Strategy
    from fastapi_users.jwt import SecretType


class CustomOAuthRouterBuilder(BaseOAuthRouterBuilder):
    """Builder for the main OAuth authentication router."""

    def __init__(
        self,
        oauth_client: BaseOAuth2,
        backend: AuthenticationBackend[User, UUID4],
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
            strategy: Annotated[Strategy[User, UUID4], Depends(self.backend.get_strategy)],
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
                raise OAuthInvalidRedirectURIError
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
        strategy: Strategy[User, UUID4],
    ) -> Response:
        token, state = access_token_state
        state_data = self.verify_state(request, state)
        frontend_redirect = state_data.get("frontend_redirect_uri")

        account_id, account_email = await self.oauth_client.get_id_email(token["access_token"])
        if account_email is None:
            if frontend_redirect:
                return self._create_error_redirect(frontend_redirect, ErrorCode.OAUTH_NOT_AVAILABLE_EMAIL.value)
            raise OAuthEmailUnavailableError

        oauth_callback = cast(
            "Callable[..., Awaitable[User]]",
            user_manager.oauth_callback,
        )

        try:
            user = await oauth_callback(
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
        except UserAlreadyExists as err:
            if frontend_redirect:
                return self._create_error_redirect(frontend_redirect, ErrorCode.OAUTH_USER_ALREADY_EXISTS.value)
            raise OAuthUserAlreadyExistsHTTPError from err

        if not user.is_active:
            if frontend_redirect:
                return self._create_error_redirect(frontend_redirect, ErrorCode.LOGIN_BAD_CREDENTIALS.value)
            raise OAuthInactiveUserHTTPError

        response = await self.backend.login(strategy, user)
        await user_manager.on_after_login(user, request, response)

        if frontend_redirect:
            return self._create_success_redirect(frontend_redirect, response)

        return response
