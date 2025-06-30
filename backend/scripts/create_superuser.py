#!/usr/bin/env python3

"""Create a FastAPI-Users superuser programmatically."""

import contextlib
import logging

import anyio
from app.api.auth.schemas import UserCreate
from app.api.auth.utils.programmatic_user_crud import create_user
from app.core.config import settings
from app.core.database import get_async_session
from fastapi_users.exceptions import InvalidPasswordException, UserAlreadyExists

# Set up logging
logger: logging.Logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Create an async context manager to get an async session
get_async_session_context = contextlib.asynccontextmanager(get_async_session)


async def create_superuser() -> None:
    """Create a FastAPI-Users superuser programmatically."""
    superuser_email = settings.superuser_email
    superuser_password = settings.superuser_password

    if not superuser_email or not superuser_password:
        err_msg = "SUPERUSER_EMAIL and SUPERUSER_PASSWORD must be set in the environment or .env file."
        raise ValueError(err_msg)

    async with get_async_session_context() as async_session:
        try:
            await create_user(
                async_session=async_session,
                user_create=UserCreate(
                    email=superuser_email,
                    password=superuser_password,
                    organization_id=None,
                    is_superuser=True,
                    is_verified=True,
                ),
                send_registration_email=False,
            )
            logger.info("Superuser %s created successfully.", superuser_email)
        except (UserAlreadyExists, InvalidPasswordException) as e:
            logger.warning("Superuser creation failed: %s", e)


if __name__ == "__main__":
    anyio.run(create_superuser)
