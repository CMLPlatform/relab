"""OAuth account-association router factory."""
# spell-checker: ignore annotationlib

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated, Any, Protocol, cast

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import Response as FastAPIResponse
from fastapi_users import schemas
from fastapi_users.models import UserOAuthProtocol
from httpx_oauth.oauth2 import BaseOAuth2, OAuth2Token  # Used at runtime for FastAPI validation
from pydantic import UUID4
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.exceptions import (
    OAuthAccountAlreadyLinkedError,
    OAuthEmailUnavailableError,
    OAuthInvalidStateError,
)
from app.api.auth.models import OAuthAccount, User
from app.api.auth.services.oauth.base import (
    OAuthFlowConfig,
    authorize_callback_dependency,
    build_authorize_response,
    create_oauth_result_redirect,
    verify_oauth_state,
)
from app.api.auth.services.user_manager import UserManager, fastapi_user_manager

from .utils import (
    FRONTEND_REDIRECT_URI_KEY,
    OAuth2AuthorizeResponse,
    OAuthCookieSettings,
)

if TYPE_CHECKING:
    from fastapi_users.authentication import Authenticator
    from fastapi_users.jwt import SecretType


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


def build_oauth_associate_router(
    oauth_client: BaseOAuth2,
    authenticator: Authenticator[User, UUID4],
    user_schema: type[schemas.U],
    state_secret: SecretType,
    oauth_flow: str,
    redirect_url: str | None = None,
    cookie_settings: OAuthCookieSettings | None = None,
    *,
    requires_verification: bool = False,
    route_name_key: str | None = None,
    extras_params: dict[str, Any] | None = None,
) -> APIRouter:
    """Build the OAuth account-association router."""
    router = APIRouter()
    key = route_name_key or oauth_client.name
    callback_route_name = f"oauth-associate:{key}.callback"
    authorize_route_name = f"oauth-associate:{key}.authorize"
    config = OAuthFlowConfig(
        oauth_client=oauth_client,
        state_secret=state_secret,
        oauth_flow=oauth_flow,
        redirect_url=redirect_url,
        cookie_settings=cookie_settings or OAuthCookieSettings(),
    )
    get_current_active_user = authenticator.current_user(active=True, verified=requires_verification)
    oauth2_authorize_callback = authorize_callback_dependency(config, callback_route_name)

    @router.get(
        "/authorize",
        name=authorize_route_name,
        response_model=OAuth2AuthorizeResponse,
    )
    async def authorize(
        request: Request,
        response: Response,
        user: Annotated[User, Depends(get_current_active_user)],
    ) -> OAuth2AuthorizeResponse:
        return await build_authorize_response(
            config,
            request,
            response,
            callback_route_name=callback_route_name,
            state_claims={"sub": str(user.id)},
            extras_params=extras_params,
        )

    # Python 3.14 (annotationlib) cannot resolve local-scope variables referenced in
    # annotations of inner functions when Pydantic rebuilds the schema. Setting
    # __annotations__ explicitly (as a plain dict of already-evaluated types) bypasses
    # annotationlib's lazy ForwardRef evaluation.
    async def callback(request, user, access_token_state, user_manager):  # noqa: ANN001, ANN202
        return await handle_oauth_associate_callback(
            config,
            request,
            user,
            access_token_state,
            user_manager,
            user_schema=user_schema,
        )

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
        response_model=user_schema,
        name=callback_route_name,
        methods=["GET"],
        description="The response varies based on the authentication backend used.",
    )
    return router


async def handle_oauth_associate_callback(
    config: OAuthFlowConfig,
    request: Request,
    user: User,
    access_token_state: tuple[OAuth2Token, str],
    user_manager: UserManager,
    *,
    user_schema: type[schemas.U],
) -> Response | schemas.U:
    """Handle one OAuth account-association callback after provider token exchange."""
    token, state = access_token_state
    state_data = verify_oauth_state(config, request, state)
    _require_state_belongs_to_user(state_data, user.id)

    account_id, account_email = await config.oauth_client.get_id_email(token["access_token"])
    _require_account_email(account_email)

    existing_account = await _find_existing_oauth_account(
        user_manager.user_db.session,
        oauth_name=config.oauth_client.name,
        account_id=account_id,
    )
    _require_account_not_linked_elsewhere(existing_account, user.id)

    if existing_account:
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
        oauth_associate_callback = cast("Any", user_manager.oauth_associate_callback)
        user = await oauth_associate_callback(
            user,
            config.oauth_client.name,
            token["access_token"],
            account_id,
            account_email,
            token.get("expires_at"),
            token.get("refresh_token"),
            request,
        )

    frontend_redirect = state_data.get(FRONTEND_REDIRECT_URI_KEY)
    if frontend_redirect:
        return create_oauth_result_redirect(frontend_redirect, status="success", response=FastAPIResponse())

    return cast("schemas.U", user_schema.model_validate(user))
