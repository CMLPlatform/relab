"""Custom registration router for user creation with proper exception handling."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request, status
from fastapi_users.exceptions import InvalidPasswordException, UserAlreadyExists

from app.api.auth.crud import add_user_role_in_organization_after_registration, validate_user_create
from app.api.auth.dependencies import UserManagerDep
from app.api.auth.exceptions import AuthCRUDError, DisposableEmailError, UserNameAlreadyExistsError
from app.api.auth.models import User
from app.api.auth.schemas import UserCreate, UserCreateWithOrganization, UserReadPublic
from app.api.auth.utils.rate_limit import REGISTER_RATE_LIMIT, limiter

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/register",
    response_model=UserReadPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
    responses={
        status.HTTP_400_BAD_REQUEST: {"description": "Bad request (disposable email, invalid password, etc.)"},
        status.HTTP_409_CONFLICT: {"description": "Conflict (user with email or username already exists)"},
        status.HTTP_429_TOO_MANY_REQUESTS: {"description": "Too many registration attempts"},
    },
)
@limiter.limit(REGISTER_RATE_LIMIT)
async def register(
    request: Request,
    user_create: UserCreate | UserCreateWithOrganization,
    user_manager: UserManagerDep,
) -> User:
    """Register a new user with optional organization creation or joining.

    Supports two registration modes:
    - With organization creation: User creates and owns a new organization
    - With organization joining: User joins an existing organization as a member
    - No organization: User registers without an organization
    """
    try:
        # Get email checker from app state if available
        email_checker = (
            request.app.state.email_checker if (request.app and hasattr(request.app.state, "email_checker")) else None
        )

        # Validate user creation data (username uniqueness, disposable email, organization)
        user_create = await validate_user_create(user_manager.user_db, user_create, email_checker)

        # Create the user through UserManager (handles password hashing, validation)
        user = await user_manager.create(user_create, safe=True, request=request)

        # Add user to organization if specified
        user = await add_user_role_in_organization_after_registration(user_manager.user_db, user, request)

        # Request email verification automatically (this triggers on_after_request_verify -> sends email)
        await user_manager.request_verify(user, request)

        logger.info("User %s registered successfully", user.email)

    except DisposableEmailError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    except UserNameAlreadyExistsError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e

    except UserAlreadyExists as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"User with email {user_create.email} already exists",
        ) from e

    except InvalidPasswordException as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password validation failed: {e.reason}",
        ) from e

    except AuthCRUDError as e:
        # Catch any other custom auth errors
        raise HTTPException(status_code=e.http_status_code, detail=str(e)) from e

    except Exception as e:
        logger.exception("Unexpected error during user registration")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred during registration",
        ) from e
    else:
        return user
