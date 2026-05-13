"""Authentication, registration, and login routes."""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi_users.authentication import Strategy
from fastapi_users.router.common import ErrorCode, ErrorModel
from pydantic import EmailStr  # Needed for Fastapi dependency injection

from app.api.auth.models import User
from app.api.auth.routers import mfa, password_reset, refresh, register
from app.api.auth.runtime_dependencies import get_email_checker
from app.api.auth.schemas import MfaPendingResponse, RefreshTokenResponse, UserRead
from app.api.auth.services import login_completion
from app.api.auth.services.email_checker import EmailChecker
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
from app.api.common.audit import AuditAction, AuditContext, audit_event
from app.api.common.routers.openapi import mark_router_routes_public
from app.core.redis import OptionalRedisDep

if TYPE_CHECKING:
    from typing import Any

FORGOT_PASSWORD_PATH = password_reset.FORGOT_PASSWORD_PATH
RESET_PASSWORD_PATH = password_reset.RESET_PASSWORD_PATH
AUTH_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {400: {"model": ErrorModel}}

router = APIRouter(prefix="/auth", tags=["auth"])


async def _authenticate_first_factor(
    credentials: OAuth2PasswordRequestForm,
    user_manager: UserManager,
    transport: str,
) -> User:
    """Authenticate password credentials and return the active user."""
    user = await user_manager.authenticate(credentials)
    if user is None or not user.is_active:
        audit_event(
            None,
            AuditAction.LOGIN_FAILURE,
            "auth",
            "credentials",
            context=AuditContext(outcome="denied", transport=transport, reason="bad_credentials"),
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=ErrorCode.LOGIN_BAD_CREDENTIALS)
    return user


@router.post(
    "/bearer/login",
    name="auth:bearer.login",
    tags=["auth"],
    response_model=RefreshTokenResponse | MfaPendingResponse,
    responses=AUTH_ERROR_RESPONSES,
    summary="Login with email and password for bearer-token clients",
    dependencies=[limiter.dependency(LOGIN_RATE_LIMIT)],
)
async def bearer_login(
    response: Response,
    credentials: Annotated[OAuth2PasswordRequestForm, Depends()],
    user_manager: Annotated[UserManager, Depends(fastapi_user_manager.get_user_manager)],
    redis: OptionalRedisDep,
    bearer_strategy: Annotated[Strategy, Depends(bearer_auth_backend.get_strategy)],
) -> RefreshTokenResponse | MfaPendingResponse:
    """Authenticate a bearer client and return access and refresh tokens in JSON."""
    user = await _authenticate_first_factor(credentials, user_manager, "bearer")
    if user.mfa_enabled:
        response.status_code = status.HTTP_202_ACCEPTED
        return await login_completion.create_mfa_pending_response(redis, user, "bearer")
    result = await login_completion.issue_bearer_login_response(
        user=user,
        user_manager=user_manager,
        redis=redis,
        bearer_strategy=bearer_strategy,
    )
    audit_event(user.id, AuditAction.LOGIN_SUCCESS, User, user.id, context=AuditContext(transport="bearer"))
    return result


@router.post(
    "/session/login",
    name="auth:session.login",
    tags=["auth"],
    response_model=MfaPendingResponse | None,
    responses=AUTH_ERROR_RESPONSES,
    summary="Login with email and password for browser sessions",
    dependencies=[limiter.dependency(LOGIN_RATE_LIMIT)],
)
async def session_login(
    response: Response,
    credentials: Annotated[OAuth2PasswordRequestForm, Depends()],
    user_manager: Annotated[UserManager, Depends(fastapi_user_manager.get_user_manager)],
    redis: OptionalRedisDep,
    cookie_strategy: Annotated[Strategy, Depends(cookie_auth_backend.get_strategy)],
) -> MfaPendingResponse | None:
    """Authenticate a browser client and return MFA challenge only when MFA is enabled."""
    user = await _authenticate_first_factor(credentials, user_manager, "session")
    if user.mfa_enabled:
        response.status_code = status.HTTP_202_ACCEPTED
        return await login_completion.create_mfa_pending_response(redis, user, "session")
    await login_completion.issue_session_login_response(
        response=response,
        user=user,
        user_manager=user_manager,
        redis=redis,
        cookie_strategy=cookie_strategy,
    )
    audit_event(user.id, AuditAction.LOGIN_SUCCESS, User, user.id, context=AuditContext(transport="session"))
    return None


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


@router.get("/validate-email")
async def validate_email(
    email: EmailStr,
    email_checker: Annotated[EmailChecker | None, Depends(get_email_checker)],
) -> dict:
    """Validate email address for registration."""
    is_disposable = False
    if email_checker:
        is_disposable = await email_checker.is_disposable(email)

    return {"isValid": not is_disposable, "reason": "Please use a permanent email address" if is_disposable else None}
