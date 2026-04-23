"""Unit tests for cache utilities."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.responses import HTMLResponse

from app.core.cache import (
    HTMLCoder,
    _backend,
    _cache_state,
    clear_cache_namespace,
    close_fastapi_cache,
    init_fastapi_cache,
)


class TestHTMLCoder:
    """Tests for HTMLCoder encode/decode."""

    def test_encode_html_response(self) -> None:
        """Test encoding an HTMLResponse extracts body and metadata."""
        response = HTMLResponse(content="<h1>Hello</h1>", status_code=200)
        encoded = HTMLCoder.encode(response)

        decoded = json.loads(encoded)
        assert decoded["type"] == "HTMLResponse"
        assert decoded["body"] == "<h1>Hello</h1>"
        assert decoded["status_code"] == 200

    def test_encode_dict(self) -> None:
        """Test encoding a regular dict uses JSON."""
        data = {"key": "value", "count": 42}
        encoded = HTMLCoder.encode(data)

        decoded = json.loads(encoded)
        assert decoded == data

    def test_decode_html_response(self) -> None:
        """Test decoding reconstructs an HTMLResponse."""
        payload = json.dumps(
            {"type": "HTMLResponse", "body": "<p>Hi</p>", "status_code": 200, "media_type": "text/html", "headers": {}}
        ).encode("utf-8")

        result = HTMLCoder.decode(payload)

        assert isinstance(result, HTMLResponse)

    def test_decode_regular_data(self) -> None:
        """Test decoding regular JSON data returns the original value."""
        data = {"key": "value"}
        encoded = json.dumps(data).encode("utf-8")

        result = HTMLCoder.decode(encoded)

        assert result == data

    def test_decode_string_input(self) -> None:
        """Test decoding handles string (not bytes) input."""
        data = [1, 2, 3]
        encoded_str = json.dumps(data)

        result = HTMLCoder.decode(encoded_str)

        assert result == data


class TestInitFastapiCache:
    """Tests for init_fastapi_cache."""

    def test_init_with_redis_client(self) -> None:
        """Test cache init uses Redis backend when redis_client is provided."""
        redis_client = MagicMock()

        with patch("app.core.cache.settings") as mock_settings, patch.object(_backend, "setup") as mock_setup:
            mock_settings.enable_caching = True
            mock_settings.cache_url = "redis://cache"
            with patch.dict(_cache_state, {"initialized": False}):
                init_fastapi_cache(redis_client)

            mock_setup.assert_called_once_with("redis://cache")

    def test_init_without_redis_uses_in_memory(self) -> None:
        """Test cache init falls back to in-memory when redis_client is None."""
        with patch("app.core.cache.settings") as mock_settings, patch.object(_backend, "setup") as mock_setup:
            mock_settings.enable_caching = True
            with patch.dict(_cache_state, {"initialized": False}):
                init_fastapi_cache(None)

            mock_setup.assert_called_once_with("mem://")

    def test_init_caching_disabled_uses_in_memory(self) -> None:
        """Test that when caching is disabled, InMemoryBackend is used."""
        with patch("app.core.cache.settings") as mock_settings, patch.object(_backend, "setup") as mock_setup:
            mock_settings.enable_caching = False
            mock_settings.environment = "testing"
            with patch.dict(_cache_state, {"initialized": False}):
                init_fastapi_cache(None)

            mock_setup.assert_called_once_with("mem://")

    async def test_close_fastapi_cache(self) -> None:
        """Closing the shared cache should close the backend when initialized."""
        with (
            patch.dict(_cache_state, {"initialized": True}),
            patch.object(_backend, "close", AsyncMock()) as mock_close,
        ):
            await close_fastapi_cache()

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
