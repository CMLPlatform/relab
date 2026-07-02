"""Login flow orchestration for password-based auth routes."""

from fastapi import HTTPException, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi_users.authentication import Strategy
from fastapi_users.router.common import ErrorCode

from app.api.auth.models import User
from app.api.auth.schemas import MfaPendingResponse, RefreshTokenResponse
from app.api.auth.services import login_completion
from app.api.auth.services.mfa_service import MfaTransport
from app.api.auth.services.user_manager import UserManager
from app.api.common.audit import AuditAction, AuditContext, audit_event
from app.core.redis import Redis


async def authenticate_first_factor(
    credentials: OAuth2PasswordRequestForm,
    user_manager: UserManager,
    transport: MfaTransport,
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


async def complete_bearer_login(
    *,
    response: Response,
    user: User,
    user_manager: UserManager,
    redis: Redis,
    bearer_strategy: Strategy,
) -> RefreshTokenResponse | MfaPendingResponse:
    """Complete bearer login after password authentication."""
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


async def complete_session_login(
    *,
    response: Response,
    user: User,
    user_manager: UserManager,
    redis: Redis,
    cookie_strategy: Strategy,
) -> MfaPendingResponse | None:
    """Complete browser-session login after password authentication."""
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
