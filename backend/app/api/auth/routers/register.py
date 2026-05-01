"""Custom registration router for user creation with proper exception handling."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request, status
from fastapi_users.exceptions import InvalidPasswordException, UserAlreadyExists

from app.api.auth.crud.users import validate_user_create
from app.api.auth.dependencies import UserManagerDep
from app.api.auth.exceptions import (
    RegistrationInvalidPasswordHTTPError,
    RegistrationUnexpectedHTTPError,
    RegistrationUserAlreadyExistsHTTPError,
)
from app.api.auth.models import User
from app.api.auth.schemas import UserCreate, UserReadPublic
from app.api.auth.services.email import mask_email_for_log
from app.api.auth.services.rate_limiter import REGISTER_RATE_LIMIT, limiter
from app.api.common.exceptions import APIError
from app.core.runtime import get_request_email_checker

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/register",
    response_model=UserReadPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
)
@limiter.limit(REGISTER_RATE_LIMIT)
async def register(
    request: Request,
    user_create: UserCreate,
    user_manager: UserManagerDep,
) -> User:
    """Register a new user."""
    try:
        email_checker = get_request_email_checker(request)

        # Validate user creation data (username uniqueness and disposable email policy)
        user_create = await validate_user_create(user_manager.user_db, user_create, email_checker)

        # Create the user through UserManager (handles password hashing, validation)
        user = await user_manager.create(user_create, safe=True, request=request)

        # Request email verification automatically (this triggers on_after_request_verify -> sends email)
        await user_manager.request_verify(user, request)

        logger.info("User %s registered successfully", mask_email_for_log(user.email))

    except UserAlreadyExists as e:
        raise RegistrationUserAlreadyExistsHTTPError from e

    except InvalidPasswordException as e:
        raise RegistrationInvalidPasswordHTTPError(e.reason) from e

    except APIError as e:
        raise HTTPException(status_code=e.http_status_code, detail=str(e)) from e

    except Exception as e:
        logger.exception("Unexpected error during user registration")
        raise RegistrationUnexpectedHTTPError from e
    else:
        return user
