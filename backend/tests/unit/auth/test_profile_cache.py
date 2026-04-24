"""Unit tests for profile cache helpers."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch
from uuid import uuid4

from app.api.auth.services.profile_cache import (
    invalidate_profile_cache,
    profile_cache_key,
)


def test_profile_cache_key_uses_user_id() -> None:
    """Profile cache keys should be canonical per user id."""
    user_id = uuid4()

    with patch("app.core.cache.settings") as mock_settings:
        mock_settings.cache.prefix = "test-cache"

        assert profile_cache_key(user_id) == f"test-cache:profiles:profile:{user_id}"


async def test_invalidate_profile_cache_deletes_exact_user_key() -> None:
    """Invalidation should delete exactly one user's cached profile."""
    user_id = uuid4()

    with (
        patch("app.core.cache.settings") as mock_settings,
        patch("app.api.auth.services.profile_cache.cache_delete", AsyncMock()) as mock_delete,
    ):
        mock_settings.cache.prefix = "test-cache"

        await invalidate_profile_cache(user_id)

        mock_delete.assert_awaited_once_with(f"test-cache:profiles:profile:{user_id}")
