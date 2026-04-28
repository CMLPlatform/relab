"""Post-login side effects for auth flows."""

import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.config import settings as auth_settings
from app.api.auth.models import User
from app.api.auth.services import refresh_token_service
from app.api.auth.services.auth_backends import COOKIE_DOMAIN, COOKIE_PATH
from app.core.config import settings as core_settings
from app.core.logging import sanitize_log_value
from app.core.runtime import get_request_services

if TYPE_CHECKING:
    from starlette.requests import Request
    from starlette.responses import Response

logger = logging.getLogger(__name__)


async def update_last_login_metadata(user: User, request: Request | None, session: AsyncSession) -> None:
    """Persist the latest login timestamp and IP address."""
    user.last_login_at = datetime.now(UTC).replace(tzinfo=None)
    if request and request.client:
        user.last_login_ip = request.client.host
    await session.commit()


async def maybe_set_refresh_token_cookie(user: User, request: Request | None, response: Response | None) -> None:
    """Create and attach a refresh token cookie when Redis is available."""
    if not request:
        return

    redis = get_request_services(request).redis
    if redis is None:
        return
    refresh_token = await refresh_token_service.create_refresh_token(redis, user.id)

    if response is not None:
        response.set_cookie(
            key="refresh_token",
            value=refresh_token,
            max_age=auth_settings.refresh_token_expire_days * 86_400,
            path=COOKIE_PATH,
            domain=COOKIE_DOMAIN,
            httponly=True,
            secure=core_settings.secure_cookies,
            samesite="lax",
        )


def log_successful_login(user: User) -> None:
    """Log a successful login event."""
    logger.info(
        "User %s logged in from %s",
        sanitize_log_value(user.email),
        sanitize_log_value(user.last_login_ip),
    )
