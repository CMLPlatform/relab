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
from app.api.common.routers.dependencies import background_tasks_from

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
        email_checker = await get_email_checker(request)

        # Username collisions still 409: usernames are public.
        user_create = await validate_user_create(user_manager.user_db, user_create, email_checker)

        user = await user_manager.create(user_create, safe=True, request=request)

        await user_manager.request_verify(user, request)

        logger.info("User %s registered successfully", mask_email_for_log(user.email))

    except UserAlreadyExists:
        # Never reveal that an email is registered: notify the address and return the
        # same accepted response as a fresh signup.
        await send_existing_account_notification(user_create.email, background_tasks_from(request))
        logger.info("Registration attempted for existing email %s", mask_email_for_log(user_create.email))

    except InvalidPasswordException as e:
        raise RegistrationInvalidPasswordHTTPError(e.reason) from e

    except APIError as e:
        raise HTTPException(status_code=e.http_status_code, detail=str(e)) from e

    except Exception as e:
        logger.exception("Unexpected error during user registration")
        raise RegistrationUnexpectedHTTPError from e

    return RegistrationResponse()
