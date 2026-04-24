"""OAuth account association router builder."""
# spell-checker: ignore annotationlib

from typing import TYPE_CHECKING, Annotated, Any, Protocol, cast

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import Response as FastAPIResponse
from fastapi_users import schemas
from fastapi_users.models import UserOAuthProtocol
from httpx_oauth.integrations.fastapi import OAuth2AuthorizeCallback
from httpx_oauth.oauth2 import BaseOAuth2, OAuth2Token  # Used at runtime for FastAPI validation
from pydantic import UUID4
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.exceptions import (
    OAuthAccountAlreadyLinkedError,
    OAuthEmailUnavailableError,
    OAuthInvalidRedirectURIError,
    OAuthInvalidStateError,
)
from app.api.auth.models import OAuthAccount, User
from app.api.auth.services.oauth_utils import (
    CSRF_TOKEN_KEY,
    OAuth2AuthorizeResponse,
    OAuthCookieSettings,
    generate_csrf_token,
    generate_state_token,
)
from app.api.auth.services.user_manager import UserManager, fastapi_user_manager

from .base import BaseOAuthRouterBuilder

if TYPE_CHECKING:
    from fastapi_users.authentication import Authenticator
    from fastapi_users.jwt import SecretType


# Pure callback-flow helpers — extracted so each branch is directly testable with plain values,
# without constructing a Request / User / UserManager.


class _HasUserId(Protocol):
    """Minimal shape of an OAuth account row the ownership check reads."""

    user_id: UUID4


def _require_state_belongs_to_user(state_data: dict[str, Any], user_id: UUID4) -> None:
    """Raise OAuthInvalidStateError if the state's ``sub`` does not match ``user_id``."""
    if state_data.get("sub") != str(user_id):
        raise OAuthInvalidStateError


def _require_account_email(account_email: str | None) -> str:
    """Return the email or raise OAuthEmailUnavailableError."""
    if account_email is None:
        raise OAuthEmailUnavailableError
    return account_email


async def _find_existing_oauth_account(
    session: AsyncSession, *, oauth_name: str, account_id: str
) -> OAuthAccount | None:
    """Look up an OAuth account by (provider name, provider account_id)."""
    result = await session.execute(
        select(OAuthAccount).where(
            OAuthAccount.oauth_name == oauth_name,
            OAuthAccount.account_id == account_id,
        )
    )
    return result.scalars().first()


def _require_account_not_linked_elsewhere(existing_account: _HasUserId | None, user_id: UUID4) -> None:
    """Raise OAuthAccountAlreadyLinkedError if the account is already owned by a different user."""
    if existing_account is not None and existing_account.user_id != user_id:
        raise OAuthAccountAlreadyLinkedError


class CustomOAuthAssociateRouterBuilder(BaseOAuthRouterBuilder):
    """Builder for the OAuth association router."""

    def __init__(
        self,
        oauth_client: BaseOAuth2,
        authenticator: Authenticator[User, UUID4],
        user_schema: type[schemas.U],
        state_secret: SecretType,
        redirect_url: str | None = None,
        cookie_settings: OAuthCookieSettings | None = None,
        *,
        requires_verification: bool = False,
        route_name_key: str | None = None,
        authorize_extras_params: dict[str, Any] | None = None,
    ) -> None:
        """Initialize association router builder.

        ``route_name_key`` overrides the key used in FastAPI route names
        (e.g. ``oauth-associate:{key}.callback``). Useful when registering two
        clients that share the same OAuth ``name`` (e.g. ``google`` and
        ``google-youtube``) to avoid duplicate route-name conflicts.

        ``authorize_extras_params`` is forwarded to
        ``oauth_client.get_authorization_url`` as ``extras_params``. Use this
        to pass provider-specific flags such as ``{"access_type": "offline",
        "prompt": "consent"}`` for the Google YouTube scope-upgrade flow.
        """
        super().__init__(oauth_client, state_secret, redirect_url, cookie_settings)
        self.authenticator = authenticator
        self.user_schema = user_schema
        self.requires_verification = requires_verification
        self.authorize_extras_params = authorize_extras_params
        key = route_name_key if route_name_key is not None else oauth_client.name
        self.callback_route_name = f"oauth-associate:{key}.callback"

    def build(self) -> APIRouter:
        """Construct the APIRouter."""
        router = APIRouter()
        get_current_active_user = self.authenticator.current_user(active=True, verified=self.requires_verification)

        callback_route_name = self.callback_route_name
        if self.redirect_url is not None:
            oauth2_authorize_callback = OAuth2AuthorizeCallback(self.oauth_client, redirect_url=self.redirect_url)
        else:
            oauth2_authorize_callback = OAuth2AuthorizeCallback(self.oauth_client, route_name=callback_route_name)

        authorize_route_name = self.callback_route_name.replace(".callback", ".authorize")

        @router.get(
            "/authorize",
            name=authorize_route_name,
            response_model=OAuth2AuthorizeResponse,
        )
        async def authorize(
            request: Request,
            response: Response,
            user: Annotated[User, Depends(get_current_active_user)],
            scopes: Annotated[list[str] | None, Query()] = None,
        ) -> OAuth2AuthorizeResponse:
            return await self._get_authorize_handler(request, response, user, scopes)

        # Python 3.14 (annotationlib) cannot resolve local-scope variables referenced in
        # annotations of inner functions when Pydantic rebuilds the schema. Setting
        # __annotations__ explicitly (as a plain dict of already-evaluated types) bypasses
        # annotationlib's lazy ForwardRef evaluation.
        async def callback(request, user, access_token_state, user_manager):  # noqa: ANN001, ANN202
            return await self._get_callback_handler(request, user, access_token_state, user_manager)

        callback.__annotations__ = {
            "request": Request,
            "user": Annotated[User, Depends(get_current_active_user)],
            "access_token_state": Annotated[tuple[OAuth2Token, str], Depends(oauth2_authorize_callback)],
            "user_manager": Annotated[UserManager, Depends(fastapi_user_manager.get_user_manager)],
            "return": Response | schemas.U,
        }

        router.add_api_route(
            "/callback",
            callback,
            response_model=self.user_schema,
            name=callback_route_name,
            methods=["GET"],
            description="The response varies based on the authentication backend used.",
        )

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
                raise OAuthInvalidRedirectURIError
            state_data["frontend_redirect_uri"] = redirect_uri

        state = generate_state_token(state_data, self.state_secret)
        authorization_url = await self.oauth_client.get_authorization_url(
            authorize_redirect_url,
            state,
            scopes,
            extras_params=self.authorize_extras_params,
        )

        self.set_csrf_cookie(response, csrf_token)
        return OAuth2AuthorizeResponse(authorization_url=authorization_url)

    async def _get_callback_handler(
        self,
        request: Request,
        user: User,
        access_token_state: tuple[OAuth2Token, str],
        user_manager: UserManager,
    ) -> Response | schemas.U:
        token, state = access_token_state
        state_data = self.verify_state(request, state)
        _require_state_belongs_to_user(state_data, user.id)

        account_id, account_email = await self.oauth_client.get_id_email(token["access_token"])
        _require_account_email(account_email)

        existing_account = await _find_existing_oauth_account(
            user_manager.user_db.session,
            oauth_name=self.oauth_client.name,
            account_id=account_id,
        )
        _require_account_not_linked_elsewhere(existing_account, user.id)

        if existing_account:
            # Same user — upgrade the stored token in-place.
            # This happens when re-running an associate flow to gain additional
            # OAuth scopes (e.g. upgrading a plain Google token to include
            # YouTube API scopes). fastapi-users' oauth_associate_callback calls
            # add_oauth_account (INSERT), which would fail on the unique
            # constraint — so we update directly instead.
            updated_user = await user_manager.user_db.update_oauth_account(
                cast("UserOAuthProtocol[UUID4, OAuthAccount]", user),
                existing_account,
                {
                    "access_token": token["access_token"],
                    "expires_at": token.get("expires_at"),
                    "refresh_token": token.get("refresh_token"),
                },
            )
            user = cast("User", updated_user)
        else:
            oauth_associate_callback = cast(
                "Any",
                user_manager.oauth_associate_callback,
            )

            user = await oauth_associate_callback(
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

        return cast("schemas.U", self.user_schema.model_validate(user))
