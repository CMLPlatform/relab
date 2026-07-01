"""OAuth login router factory."""
# spell-checker: ignore annotationlib

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated, cast

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import JSONResponse
from fastapi_users.authentication import Strategy  # Used at runtime in __annotations__ dict
from fastapi_users.exceptions import UserAlreadyExists
from fastapi_users.router.common import ErrorCode
from httpx_oauth.oauth2 import BaseOAuth2, OAuth2Token  # Used at runtime for FastAPI validation
from pydantic import UUID4

from app.api.auth.exceptions import (
    OAuthEmailUnavailableError,
    OAuthInactiveUserHTTPError,
    OAuthUserAlreadyExistsHTTPError,
)
from app.api.auth.models import User
from app.api.auth.services import login_completion
from app.api.auth.services.oauth.base import (
    OAuthFlowConfig,
    authorize_callback_dependency,
    build_authorize_response,
    create_oauth_result_redirect,
    verify_oauth_state,
)
from app.api.auth.services.user_manager import UserManager, fastapi_user_manager
from app.core.runtime import require_connection_redis

from .utils import (
    ACCESS_TOKEN_KEY,
    FRONTEND_REDIRECT_URI_KEY,
    OAuth2AuthorizeResponse,
    OAuthCookieSettings,
)

COOKIE_BACKEND_NAME = "cookie"

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from fastapi_users.authentication import AuthenticationBackend
    from fastapi_users.jwt import SecretType


def build_oauth_login_router(
    oauth_client: BaseOAuth2,
    backend: AuthenticationBackend[User, UUID4],
    state_secret: SecretType,
    oauth_flow: str,
    redirect_url: str | None = None,
    cookie_settings: OAuthCookieSettings | None = None,
    *,
    associate_by_email: bool = False,
    is_verified_by_default: bool = False,
) -> APIRouter:
    """Build the OAuth login router for one provider/backend pair."""
    router = APIRouter()
    config = OAuthFlowConfig(
        oauth_client=oauth_client,
        state_secret=state_secret,
        oauth_flow=oauth_flow,
        redirect_url=redirect_url,
        cookie_settings=cookie_settings or OAuthCookieSettings(),
    )
    callback_route_name = f"oauth:{oauth_client.name}.{backend.name}.callback"
    oauth2_authorize_callback = authorize_callback_dependency(config, callback_route_name)

    @router.get(
        "/authorize",
        name=f"oauth:{oauth_client.name}.{backend.name}.authorize",
        response_model=OAuth2AuthorizeResponse,
    )
    async def authorize(
        request: Request,
        response: Response,
    ) -> OAuth2AuthorizeResponse:
        return await build_authorize_response(
            config,
            request,
            response,
            callback_route_name=callback_route_name,
        )

    # Python 3.14 (annotationlib) cannot resolve local-scope variables referenced in
    # annotations of inner functions when Pydantic rebuilds the schema. Setting
    # __annotations__ explicitly (as a plain dict of already-evaluated types) bypasses
    # annotationlib's lazy ForwardRef evaluation.
    async def callback(request, access_token_state, user_manager, strategy):  # noqa: ANN001, ANN202
        return await handle_oauth_login_callback(
            config,
            backend,
            request,
            access_token_state,
            user_manager,
            strategy,
            associate_by_email=associate_by_email,
            is_verified_by_default=is_verified_by_default,
        )

    callback.__annotations__ = {
        "request": Request,
        "access_token_state": Annotated[tuple[OAuth2Token, str], Depends(oauth2_authorize_callback)],
        "user_manager": Annotated[UserManager, Depends(fastapi_user_manager.get_user_manager)],
        "strategy": Annotated[Strategy[User, UUID4], Depends(backend.get_strategy)],
        "return": Response,
    }

    router.add_api_route(
        "/callback",
        callback,
        name=callback_route_name,
        methods=["GET"],
        description="The response varies based on the authentication backend used.",
    )
    return router


async def handle_oauth_login_callback(  # noqa: PLR0911 - OAuth callback branches map distinct protocol outcomes.
    config: OAuthFlowConfig,
    backend: AuthenticationBackend[User, UUID4],
    request: Request,
    access_token_state: tuple[OAuth2Token, str],
    user_manager: UserManager,
    strategy: Strategy[User, UUID4],
    *,
    associate_by_email: bool,
    is_verified_by_default: bool,
) -> Response:
    """Handle one OAuth login callback after httpx-oauth token exchange."""
    token, state = access_token_state
    state_data = verify_oauth_state(config, request, state)
    frontend_redirect = state_data.get(FRONTEND_REDIRECT_URI_KEY)

    account_id, account_email = await config.oauth_client.get_id_email(token["access_token"])
    if account_email is None:
        if frontend_redirect:
            return create_oauth_result_redirect(
                frontend_redirect,
                status="error",
                error=ErrorCode.OAUTH_NOT_AVAILABLE_EMAIL.value,
            )
        raise OAuthEmailUnavailableError

    oauth_callback = cast(
        "Callable[..., Awaitable[User]]",
        user_manager.oauth_callback,
    )

    try:
        user = await oauth_callback(
            config.oauth_client.name,
            token[ACCESS_TOKEN_KEY],
            account_id,
            account_email,
            token.get("expires_at"),
            token.get("refresh_token"),
            request,
            associate_by_email=associate_by_email,
            is_verified_by_default=is_verified_by_default,
        )
    except UserAlreadyExists as err:
        if frontend_redirect:
            return create_oauth_result_redirect(
                frontend_redirect,
                status="error",
                error=ErrorCode.OAUTH_USER_ALREADY_EXISTS.value,
            )
        raise OAuthUserAlreadyExistsHTTPError from err

    if not user.is_active:
        if frontend_redirect:
            return create_oauth_result_redirect(
                frontend_redirect,
                status="error",
                error=ErrorCode.LOGIN_BAD_CREDENTIALS.value,
            )
        raise OAuthInactiveUserHTTPError

    if not user.mfa_enabled:
        response = await backend.login(strategy, user)
        await user_manager.on_after_login(user, request, response)
        if frontend_redirect:
            return create_oauth_result_redirect(frontend_redirect, status="success", response=response)
        return response

    redis = require_connection_redis(request)
    transport = "session" if backend.name == COOKIE_BACKEND_NAME else "bearer"
    mfa_response = await login_completion.create_mfa_pending_response(redis, user, transport=transport)
    if frontend_redirect:
        handoff = await login_completion.create_oauth_mfa_handoff(redis, mfa_response)
        return create_oauth_result_redirect(
            frontend_redirect,
            status="mfa_required",
            mfa_handoff=handoff,
        )
    return JSONResponse(
        status_code=status.HTTP_202_ACCEPTED,
        content=mfa_response.model_dump(mode="json"),
    )
