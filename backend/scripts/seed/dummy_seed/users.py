"""Dummy user seeding."""

from __future__ import annotations

import logging

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.auth.models import User
from app.api.auth.schemas import UserCreate
from app.api.auth.services.programmatic_user_crud import create_user

from .data import user_data

logger = logging.getLogger(__name__)


async def seed_users(session: AsyncSession) -> dict[str, User]:
    """Seed the database with sample user data."""
    user_map: dict[str, User] = {}
    for user_dict in user_data:
        stmt = select(User).where(User.email == user_dict["email"])
        result = await session.exec(stmt)
        existing_user = result.first()

        if existing_user:
            logger.info("User %s already exists, skipping creation.", user_dict["email"])
            user_map[existing_user.email] = existing_user
            continue

        user_create = UserCreate(
            email=user_dict["email"],
            password=user_dict["password"],
            username=user_dict["username"],
            is_superuser=False,
            is_verified=True,
        )
        try:
            user = await create_user(session, user_create, send_registration_email=False, skip_breach_check=True)
            user_map[user.email] = user
        except ValueError as err:
            logger.warning("Failed to create user %s: %s", user_dict["email"], err)
            stmt = select(User).where(User.email == user_dict["email"])
            result = await session.exec(stmt)
            fetched_user = result.first()
            if fetched_user is not None:
                user_map[user_dict["email"]] = fetched_user

    return user_map
