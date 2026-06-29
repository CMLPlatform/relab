"""Authentication router composition."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.auth.routers import email_validation, login, mfa, password_reset, refresh, register
from app.api.auth.schemas import UserRead
from app.api.auth.services.rate_limiter import (
    VERIFY_RATE_LIMIT,
    limiter,
)
from app.api.auth.services.user_manager import (
    fastapi_user_manager,
)
from app.api.common.routers.openapi import mark_router_routes_public

FORGOT_PASSWORD_PATH = password_reset.FORGOT_PASSWORD_PATH
RESET_PASSWORD_PATH = password_reset.RESET_PASSWORD_PATH

router = APIRouter(prefix="/auth", tags=["auth"])

router.include_router(login.router)

# Custom registration route
router.include_router(register.router, tags=["auth"])

# Refresh token and multi-device session management
router.include_router(refresh.router, tags=["auth"])
router.include_router(mfa.router, tags=["auth"])

# Mark all routes in the auth router thus far as public
mark_router_routes_public(router)

# Verification and password reset routes
verify_router = fastapi_user_manager.get_verify_router(user_schema=UserRead)
router.include_router(verify_router, dependencies=[limiter.dependency(VERIFY_RATE_LIMIT)])
router.include_router(password_reset.router)
router.include_router(email_validation.router)
