"""Unit tests for cache utilities."""

from unittest.mock import AsyncMock, MagicMock, patch

from cashews.exceptions import UnSecureDataError
from fastapi_pagination import Params
from fastapi_pagination.api import set_params
from pydantic import SecretStr

from app.core.cache import (
    _backend,
    _cache_key_excluding_dependencies,
    _cache_state,
    cache_get,
    clear_cache_namespace,
    init_cache,
)


def _request_with_query(query: str) -> MagicMock:
    request = MagicMock()
    request.url.query = query
    return request


def _example_endpoint() -> None:
    """Stand-in target for cache-key derivation."""


def test_cache_key_varies_with_query_string() -> None:
    """Query params (e.g. pagination) live outside endpoint kwargs, so the key folds in the raw query string."""
    key_page_1 = _cache_key_excluding_dependencies(_example_endpoint, request=_request_with_query("search=a&page=1"))
    key_page_2 = _cache_key_excluding_dependencies(_example_endpoint, request=_request_with_query("search=a&page=2"))
    key_page_1_again = _cache_key_excluding_dependencies(
        _example_endpoint, request=_request_with_query("search=a&page=1")
    )

    assert key_page_1 != key_page_2
    assert key_page_1 == key_page_1_again


def test_cache_key_varies_by_page_without_a_request_parameter() -> None:
    """Paginated endpoints must vary per page even when they declare no ``Request``.

    Regression: fastapi-pagination reads page/size from a ContextVar, and the key only
    folded in the query string, which is unavailable when the endpoint has no ``Request``
    parameter (``/products/suggestions/brands`` and ``/models``). Every page therefore
    hashed to one entry and page 1 was served for every page for the whole TTL.
    """
    with set_params(Params(page=1, size=50)):
        key_page_1 = _cache_key_excluding_dependencies(_example_endpoint)
    with set_params(Params(page=2, size=50)):
        key_page_2 = _cache_key_excluding_dependencies(_example_endpoint)
    with set_params(Params(page=1, size=50)):
        key_page_1_again = _cache_key_excluding_dependencies(_example_endpoint)

    assert key_page_1 != key_page_2
    # Still a cache: the same page must reuse its entry.
    assert key_page_1 == key_page_1_again


def test_cache_key_outside_a_pagination_context_omits_the_page_part() -> None:
    """An unpaginated endpoint keys without a page fragment instead of raising.

    ``set_params`` is used as a context manager so the ContextVar is reset on exit —
    otherwise a page set by an earlier test leaks in and this passes vacuously.
    """
    unpaginated = _cache_key_excluding_dependencies(_example_endpoint)
    with set_params(Params(page=1, size=50)):
        paginated = _cache_key_excluding_dependencies(_example_endpoint)

    assert unpaginated != paginated
    assert unpaginated == _cache_key_excluding_dependencies(_example_endpoint)


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
