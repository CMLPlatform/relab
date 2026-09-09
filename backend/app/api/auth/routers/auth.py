"""Authentication router composition."""

from fastapi import Depends

from app.api.auth.routers import email_validation, login, mfa, password_reset, refresh, register
from app.api.auth.schemas import UserRead
from app.api.auth.services.rate_limiter import VERIFY_RATE_LIMIT
from app.api.auth.services.user_manager import (
    fastapi_user_manager,
)
from app.api.common.audiences import PublicAPIRouter
from app.api.common.rate_limiting import limiter
from app.api.common.routers.dependencies import attach_background_tasks

FORGOT_PASSWORD_PATH = password_reset.FORGOT_PASSWORD_PATH
RESET_PASSWORD_PATH = password_reset.RESET_PASSWORD_PATH

# The verify and reset routers below are built by fastapi-users, and the UserManager
# hooks they call receive only a Request. This is how the transactional mail those
# hooks send reaches the response's background tasks instead of blocking it.
router = PublicAPIRouter(prefix="/auth", tags=["auth"], dependencies=[Depends(attach_background_tasks)])

router.include_router(login.router)

# Custom registration route
router.include_router(register.router, tags=["auth"])

# Refresh token and multi-device session management
router.include_router(refresh.router, tags=["auth"])
router.include_router(mfa.router, tags=["auth"])

# Verification and password reset routes
verify_router = fastapi_user_manager.get_verify_router(user_schema=UserRead)
router.include_router(verify_router, dependencies=[limiter.dependency(VERIFY_RATE_LIMIT)])
router.include_router(password_reset.router)
router.include_router(email_validation.router)
