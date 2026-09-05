"""Custom registration router for user creation with proper exception handling."""

import logging

from fastapi import APIRouter, HTTPException, Request, status
from fastapi_users.exceptions import InvalidPasswordException, UserAlreadyExists
from pydantic import BaseModel, Field

from app.api.auth.crud import validate_user_create
from app.api.auth.dependencies import UserManagerDep
from app.api.auth.exceptions import (
    RegistrationInvalidPasswordHTTPError,
    RegistrationUnexpectedHTTPError,
)
from app.api.auth.runtime_dependencies import get_email_checker
from app.api.auth.schemas import UserRegister
from app.api.auth.services.email.service import mask_email_for_log, send_existing_account_notification
from app.api.auth.services.rate_limiter import REGISTER_RATE_LIMIT
from app.api.common.exceptions import APIError
from app.api.common.rate_limiting import limiter

logger = logging.getLogger(__name__)

router = APIRouter()

_REGISTRATION_ACCEPTED_DETAIL = (
    "If the email address is available, a verification link has been sent. Please check your inbox."
)


class RegistrationResponse(BaseModel):
    """Uniform registration acknowledgement.

    Deliberately reveals nothing about whether the email already exists — the same
    body is returned whether a new account was created or the address was already
    taken — so registration cannot be used to enumerate accounts.
    """

    detail: str = Field(default=_REGISTRATION_ACCEPTED_DETAIL)


@router.post(
    "/register",
    response_model=RegistrationResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Register a new user",
    dependencies=[limiter.dependency(REGISTER_RATE_LIMIT)],
)
async def register(
    request: Request,
    user_create: UserRegister,
    user_manager: UserManagerDep,
) -> RegistrationResponse:
    """Register a new user, returning the same response whether or not the email is taken."""
    try:
        email_checker = get_email_checker(request)

        # Validate user creation data (username uniqueness and disposable email policy).
        # Username collisions still 409 here — usernames are public, so there is nothing
        # to hide, and the user needs to pick another.
        user_create = await validate_user_create(user_manager.user_db, user_create, email_checker)

        # Create the user through UserManager (handles password hashing, validation)
        user = await user_manager.create(user_create, safe=True, request=request)

        # Request email verification automatically (this triggers on_after_request_verify -> sends email)
        await user_manager.request_verify(user, request)

        logger.info("User %s registered successfully", mask_email_for_log(user.email))

    except UserAlreadyExists:
        # Privacy: never reveal that an email is already registered. Notify the existing
        # address and fall through to the same accepted response as a fresh signup.
        await send_existing_account_notification(user_create.email)
        logger.info("Registration attempted for existing email %s", mask_email_for_log(user_create.email))

    except InvalidPasswordException as e:
        raise RegistrationInvalidPasswordHTTPError(e.reason) from e

    except APIError as e:
        raise HTTPException(status_code=e.http_status_code, detail=str(e)) from e

    except Exception as e:
        logger.exception("Unexpected error during user registration")
        raise RegistrationUnexpectedHTTPError from e

    return RegistrationResponse()
