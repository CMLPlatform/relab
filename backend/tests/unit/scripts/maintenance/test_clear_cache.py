"""Unit tests for the clear_cache script."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from app.core.config import CacheNamespace
from scripts.maintenance import clear_cache as clear_cache_script

if TYPE_CHECKING:
    from pytest_mock import MockerFixture


class TestClearCacheScript:
    """Verify Redis cache clearing script behavior."""

    async def test_clear_cache_returns_error_when_redis_is_unavailable(
        self,
        monkeypatch: pytest.MonkeyPatch,
        mocker: MockerFixture,
    ) -> None:
        """A missing Redis connection should return a non-zero exit code."""
        close_redis_mock = mocker.AsyncMock()

        monkeypatch.setattr(clear_cache_script, "init_redis", mocker.AsyncMock(return_value=None))
        monkeypatch.setattr(clear_cache_script, "close_redis", close_redis_mock)

        exit_code = await clear_cache_script.clear_cache(CacheNamespace.DOCS)

        assert exit_code == 1
        close_redis_mock.assert_not_awaited()

    async def test_clear_cache_clears_requested_namespace(
        self,
        monkeypatch: pytest.MonkeyPatch,
        mocker: MockerFixture,
    ) -> None:
        """A valid Redis connection should initialize, clear, and close cleanly."""
        redis_client = object()
        init_cache_mock = mocker.patch.object(clear_cache_script, "init_cache")
        clear_namespace_mock = mocker.AsyncMock()
        close_redis_mock = mocker.AsyncMock()

        monkeypatch.setattr(clear_cache_script, "init_redis", mocker.AsyncMock(return_value=redis_client))
        monkeypatch.setattr(clear_cache_script, "clear_cache_namespace", clear_namespace_mock)
        monkeypatch.setattr(clear_cache_script, "close_redis", close_redis_mock)

        exit_code = await clear_cache_script.clear_cache(CacheNamespace.BACKGROUND_DATA)

        assert exit_code == 0
        init_cache_mock.assert_called_once_with(redis_client)
        clear_namespace_mock.assert_awaited_once_with(CacheNamespace.BACKGROUND_DATA)
        close_redis_mock.assert_awaited_once_with(redis_client)

    def test_main_exits_for_invalid_namespace(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Invalid namespace values should terminate with exit code 1."""
        monkeypatch.setattr(clear_cache_script.sys, "argv", ["clear_cache.py", "invalid"])

        with pytest.raises(SystemExit) as exc_info:
            clear_cache_script.main()

        assert exc_info.value.code == 1

    def test_main_uses_default_namespace(self, monkeypatch: pytest.MonkeyPatch, mocker: MockerFixture) -> None:
        """With no argument, the script should clear the default namespace."""
        clear_cache_mock = mocker.AsyncMock(return_value=0)

        monkeypatch.setattr(clear_cache_script.sys, "argv", ["clear_cache.py"])
        monkeypatch.setattr(clear_cache_script, "clear_cache", clear_cache_mock)

        with pytest.raises(SystemExit) as exc_info:
            clear_cache_script.main()

        assert exc_info.value.code == 0
        clear_cache_mock.assert_awaited_once_with(CacheNamespace.BACKGROUND_DATA)
