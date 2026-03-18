"""Authentication, registration, and login routes."""

from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.routing import APIRoute
from pydantic import EmailStr  # Needed for Fastapi dependency injection

from app.api.auth.routers import refresh, register
from app.api.auth.schemas import UserRead
from app.api.auth.services.user_manager import (
    bearer_auth_backend,
    cookie_auth_backend,
    fastapi_user_manager,
)
from app.api.auth.utils.email_validation import EmailChecker, get_email_checker_dependency
from app.api.auth.utils.rate_limit import LOGIN_RATE_LIMIT, limiter
from app.api.common.routers.openapi import mark_router_routes_public

LOGIN_PATH = "/login"

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

router.include_router(bearer_router, prefix="/bearer", tags=["auth"])
router.include_router(cookie_router, prefix="/cookie", tags=["auth"])

# Custom registration route
router.include_router(register.router, tags=["auth"])

# Refresh token and multi-device session management
router.include_router(refresh.router, tags=["auth"])

# Mark all routes in the auth router thus far as public
mark_router_routes_public(router)

# Verification and password reset routes (keep FastAPI-Users defaults)
router.include_router(fastapi_user_manager.get_verify_router(user_schema=UserRead))
router.include_router(fastapi_user_manager.get_reset_password_router())


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
