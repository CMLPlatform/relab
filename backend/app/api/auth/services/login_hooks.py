"""Post-login side effects for auth flows."""

import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.models import User
from app.api.auth.services.email import mask_email_for_log

if TYPE_CHECKING:
    from starlette.requests import Request

logger = logging.getLogger(__name__)


async def update_last_login_metadata(user: User, _request: Request | None, session: AsyncSession) -> None:
    """Persist the latest login timestamp."""
    user.last_login_at = datetime.now(UTC).replace(tzinfo=None)
    await session.commit()


def log_successful_login(user: User) -> None:
    """Log a successful login event."""
    logger.info(
        "User %s logged in",
        mask_email_for_log(user.email),
    )
