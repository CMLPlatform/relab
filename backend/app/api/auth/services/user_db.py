"""User database adapter boundary for FastAPI Users + SQLModel."""

from typing import TYPE_CHECKING

from app.api.auth.models import OAuthAccount, User
from app.api.auth.services.sqlmodel_user_database import SQLModelUserDatabaseAsync
from app.api.common.routers.dependencies import AsyncSessionDep

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from pydantic import UUID4


async def get_user_db(session: AsyncSessionDep) -> AsyncGenerator[SQLModelUserDatabaseAsync[User, UUID4]]:
    """Async generator for the user database."""
    yield SQLModelUserDatabaseAsync(session, User, OAuthAccount)
