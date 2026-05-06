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
    bootstrap_superuser_email = settings.bootstrap_superuser_email
    bootstrap_superuser_name = settings.bootstrap_superuser_name or None
    bootstrap_superuser_password = settings.bootstrap_superuser_password

    if not bootstrap_superuser_email or not bootstrap_superuser_password:
        err_msg = "BOOTSTRAP_SUPERUSER_EMAIL and BOOTSTRAP_SUPERUSER_PASSWORD must be set in backend config and secrets/<env>/."
        raise ValueError(err_msg)

    try:
        async with async_session_context() as async_session:
            try:
                await create_user(
                    async_session=async_session,
                    user_create=TrustedUserCreate.model_construct(
                        email=bootstrap_superuser_email,
                        username=bootstrap_superuser_name,
                        password=bootstrap_superuser_password.get_secret_value(),
                        is_superuser=True,
                        is_verified=True,
                    ),
                    send_registration_email=False,
                    skip_breach_check=True,
                    skip_password_validation=True,
                )
                logger.info("Superuser %s created successfully.", bootstrap_superuser_email)
            except (UserAlreadyExists, InvalidPasswordException) as e:
                logger.warning("Superuser creation failed: %s", e)
    finally:
        await close_async_engine()


def main() -> None:
    """Entry point for the create superuser script."""
    anyio.run(create_superuser)


if __name__ == "__main__":
    main()
