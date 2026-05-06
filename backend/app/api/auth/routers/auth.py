"""Authentication, registration, and login routes."""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.routing import APIRoute
from fastapi.security import OAuth2PasswordRequestForm
from fastapi_users.authentication import Strategy
from fastapi_users.router.common import ErrorCode, ErrorModel
from pydantic import EmailStr  # Needed for Fastapi dependency injection

from app.api.auth.config import settings as auth_settings
from app.api.auth.routers import password_reset, refresh, register
from app.api.auth.schemas import RefreshTokenResponse, UserRead
from app.api.auth.services import refresh_token_service
from app.api.auth.services.email_checker import EmailChecker, get_email_checker_dependency
from app.api.auth.services.rate_limiter import (
    LOGIN_RATE_LIMIT,
    VERIFY_RATE_LIMIT,
    limiter,
)
from app.api.auth.services.user_manager import (
    UserManager,
    bearer_auth_backend,
    cookie_auth_backend,
    fastapi_user_manager,
)
from app.api.common.routers.openapi import mark_router_routes_public
from app.core.redis import OptionalRedisDep

if TYPE_CHECKING:
    from typing import Any

LOGIN_PATH = "/login"
REQUEST_VERIFY_TOKEN_PATH = "/request-verify-token"  # noqa: S105 # This value is not a secret
FORGOT_PASSWORD_PATH = password_reset.FORGOT_PASSWORD_PATH
RESET_PASSWORD_PATH = password_reset.RESET_PASSWORD_PATH
AUTH_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {400: {"model": ErrorModel}}

router = APIRouter(prefix="/auth", tags=["auth"])


def _find_route(router_to_search: APIRouter, path: str) -> APIRoute:
    """Return a generated route by path."""
    return next(route for route in router_to_search.routes if isinstance(route, APIRoute) and route.path == path)


def _rate_limit_route(router_to_search: APIRouter, path: str, rate_limit: str) -> None:
    """Apply the shared limiter to a generated route endpoint."""
    route = _find_route(router_to_search, path)
    route.endpoint = limiter.limit(rate_limit)(route.endpoint)


# Use FastAPI-Users' built-in cookie auth router for browser sessions.
cookie_router = fastapi_user_manager.get_auth_router(cookie_auth_backend)

_rate_limit_route(cookie_router, LOGIN_PATH, LOGIN_RATE_LIMIT)


@router.post(
    "/bearer/login",
    name="auth:bearer.login",
    tags=["auth"],
    response_model=RefreshTokenResponse,
    responses=AUTH_ERROR_RESPONSES,
    summary="Login with email and password for bearer-token clients",
)
@limiter.limit(LOGIN_RATE_LIMIT)
async def bearer_login(
    request: Request,
    credentials: Annotated[OAuth2PasswordRequestForm, Depends()],
    user_manager: Annotated[UserManager, Depends(fastapi_user_manager.get_user_manager)],
    strategy: Annotated[Strategy, Depends(bearer_auth_backend.get_strategy)],
    redis: OptionalRedisDep,
) -> RefreshTokenResponse:
    """Authenticate a bearer client and return access and refresh tokens in JSON."""
    user = await user_manager.authenticate(credentials)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=ErrorCode.LOGIN_BAD_CREDENTIALS)

    access_token = await strategy.write_token(user)
    await user_manager.on_after_login(user, request, None)
    refresh_token_value = await refresh_token_service.create_refresh_token(redis, user.id)
    return RefreshTokenResponse(
        access_token=access_token,
        refresh_token=refresh_token_value,
        token_type="bearer",  # noqa: S106 # This value is not a secret.
        expires_in=auth_settings.access_token_ttl_seconds,
    )


router.add_api_route(
    "/session/login",
    _find_route(cookie_router, LOGIN_PATH).endpoint,
    methods=["POST"],
    name="auth:session.login",
    tags=["auth"],
    responses=AUTH_ERROR_RESPONSES,
    summary="Login with email and password for browser sessions",
)

# Custom registration route
router.include_router(register.router, tags=["auth"])

# Refresh token and multi-device session management
router.include_router(refresh.router, tags=["auth"])

# Mark all routes in the auth router thus far as public
mark_router_routes_public(router)

# Verification and password reset routes
verify_router = fastapi_user_manager.get_verify_router(user_schema=UserRead)
_rate_limit_route(verify_router, REQUEST_VERIFY_TOKEN_PATH, VERIFY_RATE_LIMIT)
router.include_router(verify_router)
router.include_router(password_reset.router)


@router.get("/validate-email")
async def validate_email(
    email: EmailStr,
    email_checker: Annotated[EmailChecker | None, Depends(get_email_checker_dependency)],
) -> dict:
    """Validate email address for registration."""
    is_disposable = False
    if email_checker:
        is_disposable = await email_checker.is_disposable(email)

    return {"isValid": not is_disposable, "reason": "Please use a permanent email address" if is_disposable else None}
