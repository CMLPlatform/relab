"""Unit tests for cache utilities."""
# spell-checker: ignore digestmod

from unittest.mock import AsyncMock, MagicMock, patch

from cashews.exceptions import UnSecureDataError
from pydantic import SecretStr

from app.core.cache import (
    _backend,
    _cache_state,
    cache_get,
    clear_cache_namespace,
    init_cache,
)


def test_init_with_redis_client() -> None:
    """Test cache init uses Redis backend when redis_client is provided."""
    redis_client = MagicMock()

    with patch("app.core.cache.settings") as mock_settings, patch.object(_backend, "setup") as mock_setup:
        mock_settings.enable_caching = True
        mock_settings.redis.cache_url = "redis://cache"
        mock_settings.cache_signing_secret = SecretStr("cache-signing-secret")
        with patch.dict(_cache_state, {"initialized": False}):
            init_cache(redis_client)

        mock_setup.assert_called_once_with("redis://cache", secret="cache-signing-secret", digestmod="sha256")

def test_init_without_redis_uses_in_memory() -> None:
    """Test cache init falls back to in-memory when redis_client is None."""
    with patch("app.core.cache.settings") as mock_settings, patch.object(_backend, "setup") as mock_setup:
        mock_settings.enable_caching = True
        mock_settings.cache_signing_secret = SecretStr("cache-signing-secret")
        with patch.dict(_cache_state, {"initialized": False}):
            init_cache(None)

        mock_setup.assert_called_once_with("mem://", secret="cache-signing-secret", digestmod="sha256")

def test_init_caching_disabled_uses_in_memory() -> None:
    """Test that when caching is disabled, InMemoryBackend is used."""
    with patch("app.core.cache.settings") as mock_settings, patch.object(_backend, "setup") as mock_setup:
        mock_settings.enable_caching = False
        mock_settings.environment = "testing"
        mock_settings.cache_signing_secret = SecretStr("cache-signing-secret")
        with patch.dict(_cache_state, {"initialized": False}):
            init_cache(None)

        mock_setup.assert_called_once_with("mem://", secret="cache-signing-secret", digestmod="sha256")

async def test_cache_get_returns_default_for_tampered_payloads() -> None:
    """Tampered cache data should behave like a miss."""
    default = object()
    with patch.object(_backend, "get", AsyncMock(side_effect=UnSecureDataError("bad signature"))):
        decoded = await cache_get("test-cache:key", default=default)

    assert decoded is default

async def test_clear_cache_namespace() -> None:
    """Test that clear_cache_namespace clears keys under the namespace prefix."""
    with (
        patch("app.core.cache.settings") as mock_settings,
        patch.object(_backend, "delete_match", AsyncMock()) as mock_delete,
    ):
        mock_settings.cache.prefix = "test-cache"

        await clear_cache_namespace("test-namespace")

        mock_delete.assert_awaited_once_with("test-cache:test-namespace:*")


