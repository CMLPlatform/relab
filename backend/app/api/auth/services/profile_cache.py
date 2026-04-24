"""Profile response cache helpers."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, Any, cast

from pydantic import UUID4

from app.api.auth.schemas import PublicProfileView
from app.core.cache import cache_delete, cache_get, cache_set, make_key
from app.core.logging import sanitize_log_value

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

logger = logging.getLogger(__name__)

PROFILE_CACHE_NAMESPACE = "profiles"
PROFILE_CACHE_TTL_SECONDS = 3600


def profile_cache_key(user_id: UUID4) -> str:
    """Return the exact cache key for one user's profile response."""
    return make_key(PROFILE_CACHE_NAMESPACE, "profile", user_id)


@asynccontextmanager
async def _log_cache_errors(action: str, user_id: UUID4) -> AsyncIterator[None]:
    """Swallow and log transient cache backend failures."""
    try:
        yield
    except ConnectionError, OSError, RuntimeError:
        logger.warning(
            "Failed to %s profile cache for user %s",
            action,
            sanitize_log_value(user_id),
            exc_info=True,
        )


async def get_cached_public_profile(user_id: UUID4) -> PublicProfileView | None:
    """Load a cached public profile response."""
    payload: dict[str, Any] | None = None
    async with _log_cache_errors("read", user_id):
        payload = await cache_get(profile_cache_key(user_id))

    if payload is None:
        return None
    return PublicProfileView.model_validate(cast("dict[str, Any]", payload))


async def cache_public_profile(user_id: UUID4, profile: PublicProfileView) -> None:
    """Cache a public profile response."""
    async with _log_cache_errors("write", user_id):
        await cache_set(
            profile_cache_key(user_id),
            profile.model_dump(mode="json"),
            expire=PROFILE_CACHE_TTL_SECONDS,
        )


async def invalidate_profile_cache(user_id: UUID4) -> None:
    """Best-effort invalidation for one user's cached profile."""
    async with _log_cache_errors("invalidate", user_id):
        await cache_delete(profile_cache_key(user_id))
