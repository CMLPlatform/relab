"""Authentication, registration, and login routes."""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated

from fastapi import APIRouter, Depends
from fastapi.routing import APIRoute
from fastapi_users.router.common import ErrorModel
from pydantic import EmailStr  # Needed for Fastapi dependency injection

from app.api.auth.routers import refresh, register
from app.api.auth.schemas import UserRead
from app.api.auth.services.email_checker import EmailChecker, get_email_checker_dependency
from app.api.auth.services.rate_limiter import (
    LOGIN_RATE_LIMIT,
    PASSWORD_RESET_RATE_LIMIT,
    VERIFY_RATE_LIMIT,
    limiter,
)
from app.api.auth.services.user_manager import (
    bearer_auth_backend,
    cookie_auth_backend,
    fastapi_user_manager,
)
from app.api.common.routers.openapi import mark_router_routes_public

if TYPE_CHECKING:
    from typing import Any

LOGIN_PATH = "/login"
REQUEST_VERIFY_TOKEN_PATH = "/request-verify-token"  # noqa: S105 # This value is not a secret
FORGOT_PASSWORD_PATH = "/forgot-password"  # noqa: S105 # This value is not a secret
AUTH_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {400: {"model": ErrorModel}}

router = APIRouter(prefix="/auth", tags=["auth"])


# Use FastAPI-Users' built-in auth routers with rate limiting on login
bearer_router = fastapi_user_manager.get_auth_router(bearer_auth_backend)
cookie_router = fastapi_user_manager.get_auth_router(cookie_auth_backend)

# Apply rate limiting to login routes
for route in bearer_router.routes:
    if isinstance(route, APIRoute) and route.path == LOGIN_PATH:
        route.endpoint = limiter.limit(LOGIN_RATE_LIMIT)(route.endpoint)

for route in cookie_router.routes:
    if isinstance(route, APIRoute) and route.path == LOGIN_PATH:
        route.endpoint = limiter.limit(LOGIN_RATE_LIMIT)(route.endpoint)

router.add_api_route(
    LOGIN_PATH,
    next(route.endpoint for route in bearer_router.routes if isinstance(route, APIRoute) and route.path == LOGIN_PATH),
    methods=["POST"],
    name="auth:login",
    tags=["auth"],
    responses=AUTH_ERROR_RESPONSES,
    summary="Login with email and password",
)
router.include_router(cookie_router, prefix="/session", tags=["auth"])

# Custom registration route
router.include_router(register.router, tags=["auth"])

# Refresh token and multi-device session management
router.include_router(refresh.router, tags=["auth"])

# Mark all routes in the auth router thus far as public
mark_router_routes_public(router)

# Verification and password reset routes (rate-limit the email-sending endpoint)
verify_router = fastapi_user_manager.get_verify_router(user_schema=UserRead)
for route in verify_router.routes:
    if isinstance(route, APIRoute) and route.path == REQUEST_VERIFY_TOKEN_PATH:
        route.endpoint = limiter.limit(VERIFY_RATE_LIMIT)(route.endpoint)
router.include_router(verify_router)
reset_password_router = fastapi_user_manager.get_reset_password_router()
for route in reset_password_router.routes:
    if isinstance(route, APIRoute) and route.path == FORGOT_PASSWORD_PATH:
        route.endpoint = limiter.limit(PASSWORD_RESET_RATE_LIMIT)(route.endpoint)
router.include_router(reset_password_router)


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
