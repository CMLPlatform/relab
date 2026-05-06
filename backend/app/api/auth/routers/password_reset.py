"""Password reset routes with OWASP-aligned throttling and response behavior."""

from __future__ import annotations

import asyncio
import time
from contextlib import suppress
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Body, HTTPException, Request, status
from fastapi_users import exceptions
from fastapi_users.router.reset import RESET_PASSWORD_RESPONSES, ErrorCode
from pydantic import EmailStr

from app.api.auth.dependencies import UserManagerDep
from app.api.auth.services.rate_limiter import (
    PASSWORD_RESET_RATE_LIMIT,
    limiter,
    rate_limit_bucket_key,
)

FORGOT_PASSWORD_PATH = "/forgot-password"  # noqa: S105 # This value is not a secret
RESET_PASSWORD_PATH = "/reset-password"  # noqa: S105 # This value is not a secret
FORGOT_PASSWORD_MINIMUM_RESPONSE_SECONDS = 0.25

router = APIRouter()


def _password_reset_identifier_rate_limit_key(identifier: str) -> str:
    """Return a privacy-preserving forgot-password rate-limit key."""
    return rate_limit_bucket_key("auth:password-reset:account", identifier)


async def _sleep_until_minimum_elapsed(started_at: float) -> None:
    """Pad forgot-password responses to reduce account enumeration timing signals."""
    remaining = FORGOT_PASSWORD_MINIMUM_RESPONSE_SECONDS - (time.monotonic() - started_at)
    if remaining > 0:
        await asyncio.sleep(remaining)


@router.post(
    FORGOT_PASSWORD_PATH,
    status_code=status.HTTP_202_ACCEPTED,
    name="reset:forgot_password",
)
@limiter.limit(PASSWORD_RESET_RATE_LIMIT)
async def forgot_password(
    request: Request,
    background_tasks: BackgroundTasks,
    email: Annotated[EmailStr, Body(..., embed=True)],
    user_manager: UserManagerDep,
) -> None:
    """Start a forgot-password request without revealing whether the account exists."""
    started_at = time.monotonic()
    limiter.hit_key(PASSWORD_RESET_RATE_LIMIT, _password_reset_identifier_rate_limit_key(str(email)))
    request.state.background_tasks = background_tasks

    try:
        user = await user_manager.get_by_email(email)
    except exceptions.UserNotExists:
        await _sleep_until_minimum_elapsed(started_at)
        return

    with suppress(exceptions.UserInactive):
        await user_manager.forgot_password(user, request)

    await _sleep_until_minimum_elapsed(started_at)
    return


@router.post(
    RESET_PASSWORD_PATH,
    name="reset:reset_password",
    responses=RESET_PASSWORD_RESPONSES,
)
@limiter.limit(PASSWORD_RESET_RATE_LIMIT)
async def reset_password(
    request: Request,
    token: Annotated[str, Body(...)],
    password: Annotated[str, Body(...)],
    user_manager: UserManagerDep,
) -> None:
    """Reset a password while preserving FastAPI-Users' public error contract."""
    try:
        await user_manager.reset_password(token, password, request)
    except (
        exceptions.InvalidResetPasswordToken,
        exceptions.UserNotExists,
        exceptions.UserInactive,
    ) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorCode.RESET_PASSWORD_BAD_TOKEN,
        ) from exc
    except exceptions.InvalidPasswordException as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": ErrorCode.RESET_PASSWORD_INVALID_PASSWORD,
                "reason": exc.reason,
            },
        ) from exc
