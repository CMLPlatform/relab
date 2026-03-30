#!/usr/bin/env python3

"""Create a normal, verified user programmatically (for admins).

Usage examples:
  python -m scripts.users.create_user --email user@example.com --username alice
  python -m scripts.users.create_user --email user@example.com --password secret123
"""

import argparse
import getpass
import logging

import anyio
from fastapi_users.exceptions import InvalidPasswordException, UserAlreadyExists

from app.api.auth.schemas import UserCreate
from app.api.auth.utils.programmatic_user_crud import create_user
from app.core.database import async_session_context, close_async_engine

logger: logging.Logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


async def create_normal_user(email: str, username: str | None, password: str) -> None:
    """Create a non-superuser who is marked as verified."""
    if not email or not password:
        msg = "email and password must be provided"
        raise ValueError(msg)

    try:
        async with async_session_context() as async_session:
            try:
                await create_user(
                    async_session=async_session,
                    user_create=UserCreate(
                        email=email,
                        username=username or None,
                        password=password,
                        organization_id=None,
                        is_superuser=False,
                        is_verified=True,
                    ),
                    send_registration_email=False,
                )
                logger.info("User %s created successfully.", email)
            except (UserAlreadyExists, InvalidPasswordException) as e:
                logger.warning("User creation failed: %s", e)
    finally:
        await close_async_engine()


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments for creating a normal user."""
    parser = argparse.ArgumentParser(description="Create a normal verified user (admin use).")
    parser.add_argument("--email", required=True, help="Email address for the new user")
    parser.add_argument("--username", required=False, help="Optional username for the new user")
    parser.add_argument("--password", required=False, help="Password for the new user (will prompt if omitted)")
    return parser.parse_args()


def main() -> None:
    """Entry point for the create user script."""
    args = parse_args()
    password = args.password
    if not password:
        password = getpass.getpass(prompt="Password: ")

    anyio.run(create_normal_user, args.email, args.username, password)


if __name__ == "__main__":
    main()
