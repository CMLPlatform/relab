#!/usr/bin/env python3

"""Create a FastAPI-Users superuser programmatically."""

import logging

import anyio
from fastapi_users.exceptions import InvalidPasswordException, UserAlreadyExists

from app.api.auth.schemas import TrustedUserCreate
from app.api.auth.services.programmatic_user_crud import create_user
from app.core.config import settings
from app.core.database import async_session_context, close_async_engine

# Set up logging
logger: logging.Logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


async def create_superuser() -> None:
    """Create a FastAPI-Users superuser programmatically."""
    superuser_email = settings.superuser_email
    superuser_name = settings.superuser_name or None
    superuser_password = settings.superuser_password

    if not superuser_email or not superuser_password:
        err_msg = "SUPERUSER_EMAIL and SUPERUSER_PASSWORD must be set in the environment or .env file."
        raise ValueError(err_msg)

    try:
        async with async_session_context() as async_session:
            try:
                await create_user(
                    async_session=async_session,
                    user_create=TrustedUserCreate.model_construct(
                        email=superuser_email,
                        username=superuser_name,
                        password=superuser_password.get_secret_value(),
                        is_superuser=True,
                        is_verified=True,
                    ),
                    send_registration_email=False,
                    skip_breach_check=True,
                    skip_password_validation=True,
                )
                logger.info("Superuser %s created successfully.", superuser_email)
            except (UserAlreadyExists, InvalidPasswordException) as e:
                logger.warning("Superuser creation failed: %s", e)
    finally:
        await close_async_engine()


def main() -> None:
    """Entry point for the create superuser script."""
    anyio.run(create_superuser)


if __name__ == "__main__":
    main()
