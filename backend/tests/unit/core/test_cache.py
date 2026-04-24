"""Unit tests for cache utilities."""

from unittest.mock import AsyncMock, MagicMock, patch

from app.core.cache import (
    _backend,
    _cache_state,
    cache_delete,
    cache_delete_pattern,
    cache_get,
    cache_namespace,
    cache_set,
    clear_cache_namespace,
    close_cache,
    init_cache,
    make_key,
)


class TestCacheLifecycle:
    """Tests for init_cache."""

    def test_init_with_redis_client(self) -> None:
        """Test cache init uses Redis backend when redis_client is provided."""
        redis_client = MagicMock()

        with patch("app.core.cache.settings") as mock_settings, patch.object(_backend, "setup") as mock_setup:
            mock_settings.enable_caching = True
            mock_settings.cache_url = "redis://cache"
            with patch.dict(_cache_state, {"initialized": False}):
                init_cache(redis_client)

            mock_setup.assert_called_once_with("redis://cache")

    def test_init_without_redis_uses_in_memory(self) -> None:
        """Test cache init falls back to in-memory when redis_client is None."""
        with patch("app.core.cache.settings") as mock_settings, patch.object(_backend, "setup") as mock_setup:
            mock_settings.enable_caching = True
            with patch.dict(_cache_state, {"initialized": False}):
                init_cache(None)

            mock_setup.assert_called_once_with("mem://")

    def test_init_caching_disabled_uses_in_memory(self) -> None:
        """Test that when caching is disabled, InMemoryBackend is used."""
        with patch("app.core.cache.settings") as mock_settings, patch.object(_backend, "setup") as mock_setup:
            mock_settings.enable_caching = False
            mock_settings.environment = "testing"
            with patch.dict(_cache_state, {"initialized": False}):
                init_cache(None)

            mock_setup.assert_called_once_with("mem://")

    async def test_close_cache(self) -> None:
        """Closing the shared cache should close the backend when initialized."""
        with (
            patch.dict(_cache_state, {"initialized": True}),
            patch.object(_backend, "close", AsyncMock()) as mock_close,
        ):
            await close_cache()

            mock_close.assert_awaited_once()


class TestClearCacheNamespace:
    """Tests for clear_cache_namespace."""

    async def test_clear_cache_namespace(self) -> None:
        """Test that clear_cache_namespace clears keys under the namespace prefix."""
        with (
            patch("app.core.cache.settings") as mock_settings,
            patch.object(_backend, "delete_match", AsyncMock()) as mock_delete,
        ):
            mock_settings.cache.prefix = "test-cache"

            await clear_cache_namespace("test-namespace")

            mock_delete.assert_awaited_once_with("test-cache:test-namespace:*")


class TestCachePrimitives:
    """Tests for the public key-value cache primitives."""

    def test_cache_namespace_uses_configured_prefix(self) -> None:
        """Namespaces should be rooted under the configured cache prefix."""
        with patch("app.core.cache.settings") as mock_settings:
            mock_settings.cache.prefix = "test-cache"

            assert cache_namespace("profiles") == "test-cache:profiles"

    def test_make_key_joins_namespace_and_parts(self) -> None:
        """make_key should colon-join the namespace with stringified parts."""
        with patch("app.core.cache.settings") as mock_settings:
            mock_settings.cache.prefix = "test-cache"

            assert make_key("profiles", "profile", 42) == "test-cache:profiles:profile:42"

    async def test_cache_get_set_delete_exact_key(self) -> None:
        """Exact key helpers should delegate to the shared backend."""
        with (
            patch.object(_backend, "get", AsyncMock(return_value={"value": 1})) as mock_get,
            patch.object(_backend, "set", AsyncMock()) as mock_set,
            patch.object(_backend, "delete", AsyncMock()) as mock_delete,
        ):
            await cache_set("key", {"value": 1}, expire=60)
            value = await cache_get("key", default=None)
            await cache_delete("key")

            assert value == {"value": 1}
            mock_set.assert_awaited_once_with("key", {"value": 1}, expire=60)
            mock_get.assert_awaited_once_with("key", default=None)
            mock_delete.assert_awaited_once_with("key")

    async def test_cache_delete_pattern(self) -> None:
        """Pattern deletion should delegate to backend delete_match."""
        with patch.object(_backend, "delete_match", AsyncMock()) as mock_delete_match:
            await cache_delete_pattern("test-cache:profiles:*")

            mock_delete_match.assert_awaited_once_with("test-cache:profiles:*")
