"""User database adapter boundary for FastAPI Users."""

from typing import TYPE_CHECKING

from app.api.auth.models import OAuthAccount, User
from app.api.auth.services.user_database import UserDatabaseAsync
from app.api.common.routers.dependencies import AsyncSessionDep

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from pydantic import UUID4


async def get_user_db(session: AsyncSessionDep) -> AsyncGenerator[UserDatabaseAsync[User, UUID4]]:
    """Async generator for the user database."""
    yield UserDatabaseAsync(session, User, OAuthAccount)
