"""Post-login side effects for auth flows."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.config import settings as auth_settings
from app.api.auth.models import User
from app.api.auth.services import refresh_token_service
from app.api.auth.services.auth_backends import (
    AUTH_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    set_browser_auth_cookie,
)
from app.api.auth.services.email import mask_email_for_log
from app.core.runtime import get_request_services

if TYPE_CHECKING:
    from starlette.requests import Request
    from starlette.responses import Response

logger = logging.getLogger(__name__)


def set_refresh_token_cookie(response: Response, refresh_token: str) -> None:
    """Attach a host-only refresh token cookie."""
    set_browser_auth_cookie(
        response,
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        max_age=auth_settings.refresh_token_expire_days * 86_400,
    )


def _has_browser_auth_cookie(response: Response) -> bool:
    return f"{AUTH_COOKIE_NAME}=" in response.headers.get("set-cookie", "")


async def update_last_login_metadata(user: User, _request: Request | None, session: AsyncSession) -> None:
    """Persist the latest login timestamp."""
    user.last_login_at = datetime.now(UTC).replace(tzinfo=None)
    await session.commit()


async def maybe_set_refresh_token_cookie(user: User, request: Request | None, response: Response | None) -> None:
    """Create and attach a refresh token cookie for browser-session login."""
    if request is None or response is None or not _has_browser_auth_cookie(response):
        return

    redis = get_request_services(request).redis
    if redis is None:
        return
    refresh_token = await refresh_token_service.create_refresh_token(redis, user.id)
    set_refresh_token_cookie(response, refresh_token)


def log_successful_login(user: User) -> None:
    """Log a successful login event."""
    logger.info(
        "User %s logged in",
        mask_email_for_log(user.email),
    )
